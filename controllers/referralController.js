const Referral = require('../models/Referral');
const User = require('../models/User');
const ReferralCampaign = require('../models/ReferralCampaign');

// Get referral statistics for a user
exports.getReferralStats = async (req, res) => {
  try {
    const { userId } = req.params;

    // Find the user to get their referral code
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get all referrals made by this user
    const referrals = await Referral.find({ referrerId: userId });

    // Calculate statistics
    const totalReferrals = referrals.length;
    const completedReferrals = referrals.filter((r) => r.status === 'completed' || r.status === 'paid').length;
    const pendingReferrals = referrals.filter((r) => r.status === 'pending').length;
    const totalEarnings = referrals.filter((r) => r.status === 'paid').reduce((sum, r) => sum + r.rewardAmount, 0);
    const pendingEarnings = referrals.filter((r) => r.status === 'completed').reduce((sum, r) => sum + r.rewardAmount, 0);

    // Group by vehicle type
    const referralsByType = {
      '2W': referrals.filter((r) => r.vehicleType === '2W').length,
      '3W': referrals.filter((r) => r.vehicleType === '3W').length,
      Truck: referrals.filter((r) => r.vehicleType === 'Truck').length
    };

    res.status(200).json({
      success: true,
      data: {
        referralCode: user.referralCode || 'N/A',
        totalReferrals,
        completedReferrals,
        pendingReferrals,
        totalEarnings,
        pendingEarnings,
        referralsByType,
        recentReferrals: referrals.slice(0, 10) // Last 10 referrals
      }
    });
  } catch (error) {
    console.error('Error in getReferralStats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching referral statistics',
      error: error.message
    });
  }
};

// Get referral statistics by phone number
exports.getReferralStatsByPhone = async (req, res) => {
  try {
    const { phone } = req.query;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
    }

    // Find the user by phone
    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get all referrals made by this user
    const referrals = await Referral.find({ referrerId: user._id }).populate('referredUserId', 'name phone role');

    // Calculate statistics
    const totalReferrals = referrals.length;
    const completedReferrals = referrals.filter((r) => r.status === 'completed' || r.status === 'paid').length;
    const pendingReferrals = referrals.filter((r) => r.status === 'pending').length;
    const totalEarnings = referrals.filter((r) => r.status === 'paid').reduce((sum, r) => sum + r.rewardAmount, 0);
    const pendingEarnings = referrals.filter((r) => r.status === 'completed').reduce((sum, r) => sum + r.rewardAmount, 0);

    // Group by vehicle type
    const referralsByType = {
      '2W': referrals.filter((r) => r.vehicleType === '2W').length,
      '3W': referrals.filter((r) => r.vehicleType === '3W').length,
      Truck: referrals.filter((r) => r.vehicleType === 'Truck').length
    };

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: user.name,
          phone: user.phone,
          referralCode: user.referralCode || 'N/A'
        },
        totalReferrals,
        completedReferrals,
        pendingReferrals,
        totalEarnings,
        pendingEarnings,
        referralsByType,
        referrals: referrals.map((r) => ({
          id: r._id,
          referredUserName: r.referredUserName,
          referredUserPhone: r.referredUserPhone,
          vehicleType: r.vehicleType,
          rewardAmount: r.rewardAmount,
          status: r.status,
          createdAt: r.createdAt
        }))
      }
    });
  } catch (error) {
    console.error('Error in getReferralStatsByPhone:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching referral statistics',
      error: error.message
    });
  }
};

// Create a new referral (when someone uses a referral code)
exports.createReferral = async (req, res) => {
  try {
    const { referralCode, referredUserPhone, vehicleType } = req.body;

    // Validate required fields
    if (!referralCode || !referredUserPhone) {
      return res.status(400).json({
        success: false,
        message: 'Referral code and referred user phone are required'
      });
    }

    // Find the referrer by referral code
    const referrer = await User.findOne({ referralCode });
    if (!referrer) {
      return res.status(404).json({
        success: false,
        message: 'Invalid referral code'
      });
    }

    // Find the referred user
    const referredUser = await User.findOne({ phone: referredUserPhone });
    if (!referredUser) {
      return res.status(404).json({
        success: false,
        message: 'Referred user not found'
      });
    }

    // Check if referral already exists
    const existingReferral = await Referral.findOne({
      referrerId: referrer._id,
      referredUserId: referredUser._id
    });

    if (existingReferral) {
      return res.status(400).json({
        success: false,
        message: 'Referral already exists'
      });
    }

    // Get reward amount from active campaign
    let rewardAmount = 0;
    let campaignName = '';

    if (vehicleType) {
      const campaign = await ReferralCampaign.findOne({
        vehicleType,
        isActive: true
      });

      if (campaign) {
        rewardAmount = campaign.rewardAmount;
        campaignName = campaign.name;
      } else {
        // Fallback to default amounts if no campaign found
        if (vehicleType === '2W') {
          rewardAmount = 600;
        } else if (vehicleType === '3W') {
          rewardAmount = 1200;
        } else if (vehicleType === 'Truck') {
          rewardAmount = 1600;
        }
      }
    }

    // Create new referral
    const newReferral = new Referral({
      referrerId: referrer._id,
      referrerPhone: referrer.phone,
      referrerName: referrer.name || 'N/A',
      referralCode,
      referredUserId: referredUser._id,
      referredUserPhone: referredUser.phone,
      referredUserName: referredUser.name || 'N/A',
      referredUserRole: referredUser.role,
      vehicleType: vehicleType || null,
      rewardAmount,
      campaignType: campaignName,
      status: 'pending'
    });

    await newReferral.save();

    res.status(201).json({
      success: true,
      message: 'Referral created successfully',
      data: newReferral
    });
  } catch (error) {
    console.error('Error in createReferral:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating referral',
      error: error.message
    });
  }
};

// Update referral status
exports.updateReferralStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, transactionId } = req.body;

    const referral = await Referral.findById(id);
    if (!referral) {
      return res.status(404).json({
        success: false,
        message: 'Referral not found'
      });
    }

    referral.status = status;

    if (status === 'paid') {
      referral.isPaid = true;
      referral.paidAt = new Date();
      referral.transactionId = transactionId || null;
    }

    await referral.save();

    res.status(200).json({
      success: true,
      message: 'Referral status updated successfully',
      data: referral
    });
  } catch (error) {
    console.error('Error in updateReferralStatus:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating referral status',
      error: error.message
    });
  }
};

// Get all referrals (Admin)
exports.getAllReferrals = async (req, res) => {
  try {
    const { page = 1, limit = 50, status, vehicleType } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (vehicleType) filter.vehicleType = vehicleType;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const referrals = await Referral.find(filter)
      .populate('referrerId', 'name phone referralCode')
      .populate('referredUserId', 'name phone role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Referral.countDocuments(filter);

    res.status(200).json({
      success: true,
      referrals,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error in getAllReferrals:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching referrals',
      error: error.message
    });
  }
};

// Get referral campaigns info
exports.getReferralCampaigns = async (req, res) => {
  try {
    const { isActive } = req.query;

    const filter = {};
    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }

    const campaigns = await ReferralCampaign.find(filter).sort({ priority: -1, createdAt: -1 }).select('-createdBy -updatedBy');

    // Return only real campaigns from database, no default creation
    res.status(200).json({
      success: true,
      data: campaigns
    });
  } catch (error) {
    console.error('Error in getReferralCampaigns:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching campaigns',
      error: error.message
    });
  }
};

// Create a new referral campaign (Admin)
exports.createCampaign = async (req, res) => {
  try {
    const { name, vehicleType, rewardAmount, maxReward, milestones, icon, description, terms, isActive, startDate, endDate, priority } =
      req.body;

    // Validate required fields
    if (!name || !vehicleType || !rewardAmount || !description) {
      return res.status(400).json({
        success: false,
        message: 'Name, vehicle type, reward amount, and description are required'
      });
    }

    // Validate vehicle type
    if (!['2W', '3W', 'Truck'].includes(vehicleType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid vehicle type. Allowed: 2W, 3W, Truck'
      });
    }

    // Calculate maxReward from milestones if not provided
    let calculatedMaxReward = rewardAmount;
    if (milestones && milestones.length > 0) {
      calculatedMaxReward = milestones.reduce((sum, milestone) => sum + (milestone.reward || 0), 0);
    }

    const newCampaign = new ReferralCampaign({
      name,
      vehicleType,
      rewardAmount,
      maxReward: maxReward || calculatedMaxReward,
      milestones: milestones || [],
      icon: icon || (vehicleType === '2W' ? 'bike' : vehicleType === '3W' ? 'auto' : 'truck'),
      description,
      terms: terms || [],
      isActive: isActive !== undefined ? isActive : true,
      startDate: startDate || Date.now(),
      endDate: endDate || null,
      priority: priority || 0,
      createdBy: req.user?.id || null
    });

    await newCampaign.save();

    res.status(201).json({
      success: true,
      message: 'Campaign created successfully',
      data: newCampaign
    });
  } catch (error) {
    console.error('Error in createCampaign:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating campaign',
      error: error.message
    });
  }
};

// Update a referral campaign (Admin)
exports.updateCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, vehicleType, rewardAmount, maxReward, milestones, icon, description, terms, isActive, startDate, endDate, priority } =
      req.body;

    const campaign = await ReferralCampaign.findById(id);
    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found'
      });
    }

    // Validate vehicle type if provided
    if (vehicleType && !['2W', '3W', 'Truck'].includes(vehicleType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid vehicle type. Allowed: 2W, 3W, Truck'
      });
    }

    // Update fields
    if (name !== undefined) campaign.name = name;
    if (vehicleType !== undefined) campaign.vehicleType = vehicleType;
    if (rewardAmount !== undefined) campaign.rewardAmount = rewardAmount;
    if (maxReward !== undefined) campaign.maxReward = maxReward;
    if (milestones !== undefined) {
      campaign.milestones = milestones;
      // Recalculate maxReward if milestones updated
      if (milestones.length > 0 && maxReward === undefined) {
        campaign.maxReward = milestones.reduce((sum, milestone) => sum + (milestone.reward || 0), 0);
      }
    }
    if (icon !== undefined) campaign.icon = icon;
    if (description !== undefined) campaign.description = description;
    if (terms !== undefined) campaign.terms = terms;
    if (isActive !== undefined) campaign.isActive = isActive;
    if (startDate !== undefined) campaign.startDate = startDate;
    if (endDate !== undefined) campaign.endDate = endDate;
    if (priority !== undefined) campaign.priority = priority;
    campaign.updatedBy = req.user?.id || null;

    await campaign.save();

    res.status(200).json({
      success: true,
      message: 'Campaign updated successfully',
      data: campaign
    });
  } catch (error) {
    console.error('Error in updateCampaign:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating campaign',
      error: error.message
    });
  }
};

// Delete a referral campaign (Admin)
exports.deleteCampaign = async (req, res) => {
  try {
    const { id } = req.params;

    const campaign = await ReferralCampaign.findById(id);
    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found'
      });
    }

    await ReferralCampaign.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Campaign deleted successfully'
    });
  } catch (error) {
    console.error('Error in deleteCampaign:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting campaign',
      error: error.message
    });
  }
};

// Get single campaign by ID
exports.getCampaignById = async (req, res) => {
  try {
    const { id } = req.params;

    const campaign = await ReferralCampaign.findById(id);
    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found'
      });
    }

    res.status(200).json({
      success: true,
      data: campaign
    });
  } catch (error) {
    console.error('Error in getCampaignById:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching campaign',
      error: error.message
    });
  }
};

// Manual wallet credit by admin for milestone rewards
exports.manualCreditMilestone = async (req, res) => {
  try {
    const { referralId, milestoneId, amount, adminNotes } = req.body;

    if (!referralId || !milestoneId || !amount) {
      return res.status(400).json({
        success: false,
        message: 'referralId, milestoneId, and amount are required'
      });
    }

    // Find referral
    const referral = await Referral.findById(referralId);
    if (!referral) {
      return res.status(404).json({
        success: false,
        message: 'Referral not found'
      });
    }

    // Check if milestone already credited
    const existingMilestone = referral.milestonesCompleted.find(m => m.milestoneId === milestoneId);
    if (existingMilestone && existingMilestone.rewardCredited) {
      return res.status(400).json({
        success: false,
        message: 'This milestone has already been credited'
      });
    }

    // Find referrer (User or Rider)
    const Rider = require('../models/RiderSchema');
    const Transaction = require('../models/Transaction');
    
    let referrer = await User.findById(referral.referrerId);
    if (!referrer) {
      referrer = await Rider.findById(referral.referrerId);
    }

    if (!referrer) {
      return res.status(404).json({
        success: false,
        message: 'Referrer not found'
      });
    }

    // Credit wallet
    referrer.walletBalance = (referrer.walletBalance || 0) + amount;
    await referrer.save();

    // Create transaction
    const txn = await Transaction.create({
      userId: referrer._id,
      amount: amount,
      type: 'credit',
      description: `Manual Referral Reward Credit (Admin) - Milestone ${milestoneId}${adminNotes ? ': ' + adminNotes : ''}`
    });

    // Update referral record
    if (existingMilestone) {
      existingMilestone.rewardCredited = true;
      existingMilestone.reward = amount;
      existingMilestone.completedAt = new Date();
      existingMilestone.transactionId = txn._id.toString();
    } else {
      referral.milestonesCompleted.push({
        milestoneId: milestoneId,
        title: `Milestone ${milestoneId}`,
        rides: referral.totalRidesCompleted || 0,
        reward: amount,
        completedAt: new Date(),
        rewardCredited: true,
        transactionId: txn._id.toString()
      });
    }

    if (adminNotes) {
      referral.notes = (referral.notes || '') + `\n[${new Date().toISOString()}] Admin credited ₹${amount} for milestone ${milestoneId}: ${adminNotes}`;
    }

    await referral.save();

    console.log('✅ Manual milestone credit by admin:');
    console.log('   Referral ID:', referralId);
    console.log('   Milestone:', milestoneId);
    console.log('   Amount: ₹', amount);
    console.log('   Referrer:', referrer.name, '(' + referrer.phone + ')');
    console.log('   New Balance: ₹', referrer.walletBalance);

    res.status(200).json({
      success: true,
      message: 'Milestone reward credited successfully',
      data: {
        referralId: referral._id,
        milestoneId: milestoneId,
        amount: amount,
        referrerName: referrer.name,
        referrerPhone: referrer.phone,
        newWalletBalance: referrer.walletBalance,
        transactionId: txn._id
      }
    });
  } catch (error) {
    console.error('Error in manualCreditMilestone:', error);
    res.status(500).json({
      success: false,
      message: 'Error crediting milestone reward',
      error: error.message
    });
  }
};
