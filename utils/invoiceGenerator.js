const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
const moment = require('moment');
const crypto = require('crypto');
const { uploadToCloudinary } = require('./cloudinaryHelper');

/**
 * Generate invoice PDF for a booking
 * @param {Object} booking - Booking object from database
 * @param {Object} customerData - Customer information
 * @param {Object} riderData - Rider information
 * @returns {Promise<Object>} - Generated invoice details
 */
const generateInvoicePDF = async (booking, customerData, riderData) => {
  try {
    console.log('🧾 Starting invoice generation for booking:', booking._id);

    // Generate unique invoice number (format: RDO-YYYY-XXXXXX)
    const invoiceNumber = `RDO-${moment().format('YYYY')}-${String(Math.floor(100000 + Math.random() * 900000))}`;
    const currentDate = moment().format('DD MMM YYYY');
    const currentTime = moment().format('hh:mm A');

    // Calculate pricing details from fee breakdown if available
    const feeBreakdown = booking.feeBreakdown || {};
    const tripFare = parseFloat(booking.price || booking.amountPay || 0);
    const platformFee = parseFloat(feeBreakdown.platformFee || 0);
    const gstAmount = parseFloat(feeBreakdown.gstAmount || 0);
    const quickFee = parseFloat(booking.quickFee || 0);
    const discount = 0; // Can be added later
    const roundingOff = 0; // Can be added later
    const riderEarnings = parseFloat(feeBreakdown.riderEarnings || (tripFare - platformFee + gstAmount));
    const totalFare = tripFare + quickFee - discount + roundingOff;

    // Prepare address data
    const fromAddress = booking.fromAddress || {};
    const dropLocation = booking.dropLocation?.[0] || {};

    // Create HTML template for invoice
    const htmlTemplate = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Ridodrop Invoice</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
            body {
                font-family: 'Arial', sans-serif;
                font-size: 12px;
                color: #333;
                line-height: 1.3;
                background: #f8f9fa;
                margin: 0;
                padding: 0;
            }
            
            .invoice-container {
                max-width: 800px;
                margin: 0 auto;
                background: white;
                border-radius: 8px;
                overflow: hidden;
                box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            }
            
            .header {
                background: linear-gradient(135deg, #EC4D4A 0%, #FF6B6B 100%);
                color: white;
                padding: 15px 20px;
                position: relative;
                overflow: hidden;
            }
            
            .header::before {
                content: '';
                position: absolute;
                top: -50%;
                right: -20%;
                width: 200px;
                height: 200px;
                background: rgba(255,255,255,0.1);
                border-radius: 50%;
            }
            
            .logo-section {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                margin-bottom: 20px;
            }
            
            .logo {
                font-size: 28px;
                font-weight: bold;
                letter-spacing: -1px;
            }
            
            .logo .delivery {
                color: white;
            }
            
            .logo .direct {
                color: #FFD700;
            }
            
            .invoice-info {
                text-align: right;
                font-size: 12px;
            }
            
            .thank-you {
                font-size: 18px;
                margin-bottom: 10px;
                opacity: 0.9;
            }
            
            .vehicle-illustration {
                position: absolute;
                right: 20px;
                bottom: 10px;
                opacity: 0.3;
                font-size: 40px;
            }
            
            .content {
                padding: 30px;
            }
            
            .details-section {
                display: flex;
                gap: 30px;
                margin-bottom: 30px;
            }
            
            .payment-details, .order-details {
                flex: 1;
            }
            
            .section-title {
                font-size: 16px;
                font-weight: bold;
                color: #EC4D4A;
                margin-bottom: 20px;
                border-bottom: 2px solid #EC4D4A;
                padding-bottom: 5px;
            }
            
            .detail-row {
                display: flex;
                justify-content: space-between;
                padding: 8px 0;
                border-bottom: 1px solid #eee;
            }
            
            .detail-row:last-child {
                border-bottom: none;
            }
            
            .detail-label {
                color: #666;
                font-weight: 500;
            }
            
            .detail-value {
                font-weight: 600;
                color: #333;
            }
            
            .total-row {
                background: #f8f9fa;
                padding: 12px;
                margin: 10px 0;
                border-radius: 6px;
                font-weight: bold;
                font-size: 16px;
            }
            
            .address-section {
                margin-top: 30px;
            }
            
            .address-item {
                display: flex;
                gap: 20px;
                padding: 20px;
                margin: 15px 0;
                background: #f8f9fa;
                border-radius: 8px;
                border-left: 4px solid #EC4D4A;
            }
            
            .address-marker {
                width: 20px;
                height: 20px;
                border-radius: 50%;
                flex-shrink: 0;
                margin-top: 5px;
            }
            
            .pickup-marker {
                background: #4CAF50;
            }
            
            .drop-marker {
                background: #EC4D4A;
            }
            
            .address-content h4 {
                color: #333;
                font-size: 16px;
                margin-bottom: 8px;
            }
            
            .address-text {
                color: #666;
                line-height: 1.5;
                margin-bottom: 5px;
            }
            
            .address-time {
                color: #999;
                font-size: 12px;
                font-style: italic;
            }
            
            .footer {
                background: #f8f9fa;
                padding: 20px 30px;
                border-top: 1px solid #eee;
                text-align: center;
            }
            
            .company-info {
                color: #666;
                font-size: 12px;
                line-height: 1.6;
            }
            
            .disclaimer {
                margin-top: 15px;
                padding-top: 15px;
                border-top: 1px solid #ddd;
                color: #999;
                font-size: 11px;
                font-style: italic;
            }
            
            .qr-section {
                display: flex;
                align-items: center;
                gap: 15px;
                margin-top: 20px;
            }
            
            .qr-placeholder {
                width: 60px;
                height: 60px;
                background: #ddd;
                border: 2px solid #999;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 10px;
                color: #666;
            }
        </style>
    </head>
    <body>
        <div class="invoice-container">
            <!-- Header Section -->
            <div class="header">
                <div class="logo-section">
                    <div class="logo">
                        <span class="delivery">RIDODROP</span>
                    </div>
                    <div class="invoice-info">
                        <div><strong>Bill of Supply/Consignment Note: ${invoiceNumber}</strong></div>
                        <div>${currentDate}</div>
                    </div>
                </div>
                <div class="thank-you">Thank you for choosing Ridodrop</div>
                <div class="vehicle-illustration">🚚 🏍️ 🚛</div>
            </div>
            
            <!-- Main Content -->
            <div class="content">
                <!-- Payment & Order Details -->
                <div class="details-section">
                    <div class="payment-details">
                        <h3 class="section-title">PAYMENT DETAILS</h3>
                        
                        <div class="detail-row">
                            <span class="detail-label">Base Amount</span>
                            <span class="detail-value">₹${tripFare.toFixed(2)}</span>
                        </div>
                        
                        ${platformFee > 0 ? `
                        <div class="detail-row">
                            <span class="detail-label">Platform Fee (${feeBreakdown.platformFeePercentage || 0}%)</span>
                            <span class="detail-value" style="color: #e74c3c;">-₹${platformFee.toFixed(2)}</span>
                        </div>
                        ` : ''}
                        
                        ${gstAmount > 0 ? `
                        <div class="detail-row">
                            <span class="detail-label">GST (${feeBreakdown.gstPercentage || 0}%)</span>
                            <span class="detail-value">+₹${gstAmount.toFixed(2)}</span>
                        </div>
                        ` : ''}
                        
                        ${quickFee > 0 ? `
                        <div class="detail-row">
                            <span class="detail-label">Quick Fee</span>
                            <span class="detail-value">₹${quickFee.toFixed(2)}</span>
                        </div>
                        ` : ''}
                        
                        ${discount > 0 ? `
                        <div class="detail-row">
                            <span class="detail-label">Discount</span>
                            <span class="detail-value" style="color: #4CAF50;">-₹${discount.toFixed(2)}</span>
                        </div>
                        ` : ''}
                        
                        <div class="detail-row">
                            <span class="detail-label">Rounding Off</span>
                            <span class="detail-value">₹${roundingOff.toFixed(2)}</span>
                        </div>
                        
                        <div class="detail-row total-row">
                            <span class="detail-label">Customer Pays</span>
                            <span class="detail-value">₹${totalFare.toFixed(2)}</span>
                        </div>
                        
                        ${feeBreakdown.riderEarnings ? `
                        <div class="detail-row" style="background: #e8f5e8; border-radius: 4px; padding: 8px; margin-top: 10px;">
                            <span class="detail-label" style="color: #27ae60; font-weight: 600;">Rider Earnings</span>
                            <span class="detail-value" style="color: #27ae60; font-weight: bold;">₹${riderEarnings.toFixed(2)}</span>
                        </div>
                        ` : ''}
                    </div>
                    
                    <div class="order-details">
                        <h3 class="section-title">ORDER DETAILS</h3>
                        
                        <div class="detail-row">
                            <span class="detail-label">Customer Name</span>
                            <span class="detail-value">${customerData?.name || fromAddress.receiverName || 'N/A'}</span>
                        </div>
                        
                        <div class="detail-row">
                            <span class="detail-label">Vehicle Details</span>
                            <span class="detail-value">${riderData?.vehicleregisterNumber || 'N/A'} - ${booking.vehicleType || 'N/A'}</span>
                        </div>
                        
                        <div class="detail-row">
                            <span class="detail-label">Driver Name</span>
                            <span class="detail-value">${riderData?.name || riderData?.driverName || 'N/A'}</span>
                        </div>
                        
                        <div class="detail-row">
                            <span class="detail-label">Payment Method</span>
                            <span class="detail-value">${booking.payFrom === 'online' ? 'Online Payment' : 'Cash Payment'}</span>
                        </div>
                        
                        <div class="detail-row">
                            <span class="detail-label">Distance</span>
                            <span class="detail-value">${booking.distanceKm || '0'} km</span>
                        </div>
                        
                        <div class="detail-row">
                            <span class="detail-label">Booking ID</span>
                            <span class="detail-value">#${booking._id.toString().slice(-8).toUpperCase()}</span>
                        </div>
                        
                        <div class="detail-row">
                            <span class="detail-label">Status</span>
                            <span class="detail-value" style="color: #4CAF50;">Confirmed</span>
                        </div>
                    </div>
                </div>
                
                <!-- Address Details -->
                <div class="address-section">
                    <h3 class="section-title">ADDRESS DETAILS</h3>
                    
                    <div class="address-item">
                        <div class="address-marker pickup-marker"></div>
                        <div class="address-content">
                            <h4>Pickup: ${fromAddress.receiverName || customerData?.name || 'Pickup Location'}</h4>
                            <div class="address-text">${(fromAddress.address || 'Address not provided').substring(0, 50)}${(fromAddress.address || '').length > 50 ? '...' : ''}</div>
                        </div>
                    </div>
                    
                    <div class="address-item">
                        <div class="address-marker drop-marker"></div>
                        <div class="address-content">
                            <h4>Drop: ${dropLocation.receiverName || dropLocation.ReciversName || 'Drop Location'}</h4>
                            <div class="address-text">${((dropLocation.address || dropLocation.Address || dropLocation.Address1 || 'Address not provided')).substring(0, 50)}${((dropLocation.address || dropLocation.Address || dropLocation.Address1 || '')).length > 50 ? '...' : ''}</div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Footer -->
            <div class="footer">
                <div class="company-info">
                    <strong>RIDODROP LOGISTICS SERVICES PRIVATE LIMITED</strong><br>
                    Bangalore Office, Electronic City, Bengaluru, Karnataka 560100<br>
                    Customer Support: +91-8000-123-456 | Email: support@ridodrop.com
                </div>
                
                <div class="qr-section">
                    <div class="qr-placeholder">QR CODE</div>
                    <div style="flex: 1; text-align: left; font-size: 11px; color: #666;">
                        GST: 29ABCDE1234F5Z6 • SAC Code: 996511 • CIN Code: U63090DL2011PTC234567<br>
                        PAN: ABCDE1234F
                    </div>
                </div>
                
                <div class="disclaimer">
                    This is computer generated document and does not require any stamp or signature.
                </div>
            </div>
        </div>
    </body>
    </html>
    `;

    console.log('📄 HTML template generated, launching puppeteer...');

    // Generate PDF using Puppeteer
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    
    // Set content and wait for it to load
    await page.setContent(htmlTemplate, { waitUntil: 'networkidle0' });
    
    // Generate PDF buffer - optimized for single page
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      scale: 0.7,
      margin: {
        top: '3mm',
        right: '3mm',
        bottom: '3mm',
        left: '3mm'
      }
    });

    await browser.close();

    console.log('✅ PDF generated successfully, uploading to Cloudinary...');

    // Upload to Cloudinary
    const fileName = `invoice_${invoiceNumber}_${Date.now()}.pdf`;
    
    // Create temporary file for Cloudinary upload
    const tempFilePath = path.join(__dirname, '..', 'uploads', fileName);
    
    // Ensure uploads directory exists
    const uploadsDir = path.dirname(tempFilePath);
    await fs.mkdir(uploadsDir, { recursive: true });
    
    // Write PDF to temporary file
    await fs.writeFile(tempFilePath, pdfBuffer);

    // Upload PDF to Cloudinary using file path approach 
    const cloudinary = require('../config/cloudinary');
    
    const cloudinaryResult = await cloudinary.uploader.upload(tempFilePath, {
      resource_type: 'raw',
      public_id: `invoice_${invoiceNumber}`,
      folder: 'invoices',
      use_filename: true,
      unique_filename: false
    });

    // Clean up temporary file
    await fs.unlink(tempFilePath).catch(err => 
      console.log('⚠️ Could not delete temp file:', err.message)
    );

    console.log('✅ Invoice uploaded to Cloudinary:', cloudinaryResult.secure_url);

    return {
      invoiceNumber,
      invoiceUrl: cloudinaryResult.secure_url,
      invoiceCloudinaryId: cloudinaryResult.public_id,
      generatedAt: new Date(),
      totalAmount: totalFare,
      fileName: fileName
    };

  } catch (error) {
    console.error('❌ Error generating invoice PDF:', error);
    throw new Error(`Invoice generation failed: ${error.message}`);
  }
};

module.exports = {
  generateInvoicePDF
};