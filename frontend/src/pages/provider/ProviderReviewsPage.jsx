import { Link } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import { PageLoader } from '../../components/ui/Spinner';
import { Alert, ErrorState } from '../../components/ui/feedback';
import ProviderReviews from '../../features/reviews/ProviderReviews';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { providerApi } from '../../services/providerApi';

/** What customers have said about you: the same reviews and rating summary the public sees on your profile. */
export default function ProviderReviewsPage() {
  useDocumentTitle('My reviews');
  const me = useAsync((signal) => providerApi.getMe(signal), []);
  const profile = me.data?.profile;

  return (
    <>
      <PageHeader title="My reviews" description="What customers said after completed jobs. Customers can only review a job they paid for and finished." />
      {me.loading && <PageLoader label="Loading your reviews" />}
      {me.error && <ErrorState error={me.error} onRetry={me.reload} />}
      {me.data && !profile && (
        <Alert tone="info" title="Create your provider profile first">Reviews belong to your profile. <Link to="/dashboard/provider/profile" className="font-semibold underline">Set it up</Link>.</Alert>
      )}
      {profile && profile.verificationStatus !== 'verified' && (
        <Alert tone="info" title="Reviews show once you are verified">Customers can only find and hire verified providers. <Link to="/dashboard/provider/profile" className="font-semibold underline">See your verification status</Link>.</Alert>
      )}
      {profile?.verificationStatus === 'verified' && <div className="panel p-6"><ProviderReviews providerId={profile.id} /></div>}
    </>
  );
}
