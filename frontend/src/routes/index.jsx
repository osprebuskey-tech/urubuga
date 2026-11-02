import { createBrowserRouter } from 'react-router-dom';
import PublicLayout from '../layouts/PublicLayout';
import AuthLayout from '../layouts/AuthLayout';
import DashboardLayout from '../layouts/DashboardLayout';
import ProtectedRoute from './ProtectedRoute';
import GuestOnly from './GuestOnly';
import ErrorPage from '../pages/ErrorPage';
import { ROLES } from '../utils/constants';

// Each page is its own chunk, loaded when first visited.
const page = (loader) => ({ lazy: async () => ({ Component: (await loader()).default }) });

export const router = createBrowserRouter([
  {
    errorElement: <ErrorPage />,
    children: [
      {
        element: <PublicLayout />,
        children: [
          // The welcome page is for visitors: once signed in you are sent to the dashboard until you log out.
          { element: <GuestOnly />, children: [{ index: true, ...page(() => import('../pages/HomePage')) }] },
          { path: 'categories', ...page(() => import('../pages/CategoriesPage')) },
          { path: 'search', ...page(() => import('../pages/SearchPage')) },
          { path: 'providers/:id', ...page(() => import('../pages/ProviderProfilePage')) },
          { path: 'services/:id', ...page(() => import('../pages/ServiceDetailsPage')) },
        ],
      },
      {
        element: <AuthLayout />,
        children: [
          { path: 'login', ...page(() => import('../pages/LoginPage')) },
          { path: 'register', ...page(() => import('../pages/RegisterPage')) },
          { path: 'forgot-password', ...page(() => import('../pages/ForgotPasswordPage')) },
          { path: 'reset-password', ...page(() => import('../pages/ResetPasswordPage')) },
          { path: 'verify-email', ...page(() => import('../pages/VerifyEmailPage')) },
        ],
      },
      {
        path: 'dashboard',
        element: <ProtectedRoute><DashboardLayout /></ProtectedRoute>,
        children: [
          { index: true, ...page(() => import('../pages/DashboardPage')) },
          { path: 'settings', ...page(() => import('../pages/SettingsPage')) },
          { path: 'notifications', ...page(() => import('../pages/NotificationsPage')) },
          { path: 'bookings', ...page(() => import('../pages/bookings/BookingsPage')) },
          { path: 'bookings/:id', ...page(() => import('../pages/bookings/BookingDetailPage')) },
          { path: 'disputes', ...page(() => import('../pages/disputes/DisputesListPage')) },
          // Parties and admins only; the API returns 404 to anyone else.
          { path: 'disputes/:id', ...page(() => import('../pages/disputes/DisputePage')) },
          // Any signed-in user can open a request link; the API decides whether they may see it (owner, admin, or a provider it concerns).
          { path: 'requests/:id', ...page(() => import('../pages/requests/RequestDetailPage')) },
          {
            // Identity documents and rating history belong to people who hire or offer services.
            element: <ProtectedRoute roles={[ROLES.CUSTOMER, ROLES.BUSINESS, ROLES.PROVIDER]} />,
            children: [
              { path: 'documents', ...page(() => import('../pages/DocumentsPage')) },
              { path: 'ratings', ...page(() => import('../pages/RatingHistoryPage')) },
            ],
          },
          {
            element: <ProtectedRoute roles={[ROLES.CUSTOMER, ROLES.BUSINESS]} />,
            children: [
              { path: 'verification', ...page(() => import('../pages/AccountVerificationPage')) },
              { path: 'requests', ...page(() => import('../pages/requests/RequestsPage')) },
              { path: 'requests/new', ...page(() => import('../pages/requests/NewRequestPage')) },
              { path: 'requests/:id/edit', ...page(() => import('../pages/requests/RequestEditPage')) },
            ],
          },
          {
            element: <ProtectedRoute roles={[ROLES.PROVIDER]} />,
            children: [
              { path: 'provider/profile', ...page(() => import('../pages/provider/ProviderProfileEditPage')) },
              { path: 'provider/verification', ...page(() => import('../pages/provider/VerificationPage')) },
              { path: 'provider/requests', ...page(() => import('../pages/provider/IncomingRequestsPage')) },
              { path: 'provider/services', ...page(() => import('../pages/provider/MyServicesPage')) },
              { path: 'provider/reviews', ...page(() => import('../pages/provider/ProviderReviewsPage')) },
              { path: 'provider/services/new', ...page(() => import('../pages/provider/ServiceEditorPage')) },
              { path: 'provider/services/:id/edit', ...page(() => import('../pages/provider/ServiceEditorPage')) },
            ],
          },
          {
            element: <ProtectedRoute roles={[ROLES.BUSINESS]} />,
            children: [{ path: 'business/company', ...page(() => import('../pages/business/CompanyProfilePage')) }],
          },
          {
            // Money screens: administrators and the payment follow-up role (the API checks the same).
            element: <ProtectedRoute roles={[ROLES.ADMIN, ROLES.FINANCE]} />,
            children: [
              { path: 'admin/payments', ...page(() => import('../pages/admin/AdminPaymentsPage')) },
              { path: 'admin/payments/follow-up', ...page(() => import('../pages/admin/PaymentFollowUpPage')) },
              { path: 'admin/verification-payments', ...page(() => import('../pages/admin/AdminVerificationPaymentsPage')) },
            ],
          },
          {
            element: <ProtectedRoute roles={[ROLES.SUPER_ADMIN]} />,
            children: [
              { path: 'super/activity', ...page(() => import('../pages/super/ActivityReportPage')) },
              { path: 'super/users/new', ...page(() => import('../pages/super/CreateUserPage')) },
              { path: 'super/partners', ...page(() => import('../pages/super/PartnersPage')) },
              { path: 'super/announcements', ...page(() => import('../pages/super/AnnouncementsPage')) },
              { path: 'super/verification-fee', ...page(() => import('../pages/super/VerificationFeePage')) },
              { path: 'super/recommendations', ...page(() => import('../pages/super/RecommendationsPage')) },
              { path: 'super/terms', ...page(() => import('../pages/super/TermsAdminPage')) },
            ],
          },
          {
            element: <ProtectedRoute roles={[ROLES.ADMIN]} />,
            children: [
              { path: 'admin/providers', ...page(() => import('../pages/admin/AdminProvidersPage')) },
              { path: 'admin/verification', ...page(() => import('../pages/admin/AdminVerificationPage')) },
              { path: 'admin/verification/:id', ...page(() => import('../pages/admin/AdminVerificationDetailPage')) },
              { path: 'admin/ratings', ...page(() => import('../pages/admin/AdminRatingsPage')) },
              { path: 'admin/contracts', ...page(() => import('../pages/admin/AdminContractsPage')) },
              { path: 'admin/disputes', ...page(() => import('../pages/admin/AdminDisputesPage')) },
              { path: 'admin/reports', ...page(() => import('../pages/admin/AdminReportsPage')) },
              { path: 'admin/reviews', ...page(() => import('../pages/admin/AdminReviewsPage')) },
              { path: 'admin/categories', ...page(() => import('../pages/admin/AdminCategoriesPage')) },
              { path: 'admin/users', ...page(() => import('../pages/admin/AdminUsersPage')) },
            ],
          },
        ],
      },
      {
        element: <PublicLayout />,
        children: [{ path: '*', ...page(() => import('../pages/NotFoundPage')) }],
      },
    ],
  },
]);
