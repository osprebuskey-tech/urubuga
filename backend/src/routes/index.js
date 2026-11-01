const router = require('express').Router();

router.use('/auth', require('./authRoutes'));
router.use('/admin', require('./adminRoutes'));
router.use('/categories', require('./categoryRoutes'));
router.use('/providers', require('./providerRoutes'));
router.use('/services', require('./listingRoutes'));
router.use('/companies', require('./companyRoutes'));
router.use('/search', require('./searchRoutes'));
router.use('/requests', require('./requestRoutes'));
router.use('/quotations', require('./quotationRoutes'));
router.use('/bookings', require('./bookingRoutes'));
router.use('/reviews', require('./reviewRoutes'));
router.use('/payments', require('./paymentRoutes'));
router.use('/disputes', require('./disputeRoutes'));
router.use('/notifications', require('./notificationRoutes'));
router.use('/partners', require('./partnerRoutes'));
router.use('/announcements', require('./announcementRoutes'));
router.use('/verification', require('./verificationRoutes'));
router.use('/documents', require('./documentRoutes'));
router.use('/terms', require('./termsRoutes'));
router.use('/contracts', require('./contractRoutes'));
router.use('/reviews', require('./ratingHistoryRoutes'));

module.exports = router;
