import { useState } from 'react';
import PageHeader from '../../components/ui/PageHeader';
import { PageLoader } from '../../components/ui/Spinner';
import { Alert, ErrorState } from '../../components/ui/feedback';
import AvatarUploader from '../../features/providers/AvatarUploader';
import PortfolioManager from '../../features/providers/PortfolioManager';
import ProfileForm from '../../features/providers/ProfileForm';
import VerificationPanel from '../../features/providers/VerificationPanel';
import { useAsync, allowCode } from '../../hooks/useAsync';
import { useCategories } from '../../hooks/useCategories';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { providerApi } from '../../services/providerApi';

export default function ProviderProfileEditPage() {
  useDocumentTitle('Provider profile');
  const { categories, loading: catsLoading, error: catsError } = useCategories();
  const loaded = useAsync((signal) => allowCode(providerApi.getMe(signal), 'PROFILE_NOT_FOUND'), []);
  const [saved, setSaved] = useState(null);

  if (loaded.loading || catsLoading) return <PageLoader label="Loading your profile" />;
  if (loaded.error) return <ErrorState error={loaded.error} onRetry={loaded.reload} />;
  if (catsError) return <ErrorState error={catsError} onRetry={() => window.location.reload()} />;

  const profile = saved ?? loaded.data?.profile ?? null;

  return (
    <>
      <PageHeader title="Provider profile" description={profile ? 'This is what customers see when they find you.' : 'Create your profile to start getting listed.'} />
      <div className="space-y-8">
        {profile && <VerificationPanel profile={profile} onUpdated={setSaved} />}
        <ProfileForm key={profile?.id ?? 'new'} profile={profile} categories={categories} onSaved={setSaved} />
        {profile ? (
          <>
            <section className="panel p-6" aria-labelledby="photo"><h2 id="photo" className="mb-4 text-xl font-semibold">Profile photo</h2><AvatarUploader profile={profile} onUpdated={setSaved} /></section>
            <section aria-labelledby="portfolio-h"><h2 id="portfolio-h" className="mb-4 text-xl font-semibold">Portfolio</h2><PortfolioManager profile={profile} onUpdated={setSaved} /></section>
          </>
        ) : (
          <Alert tone="info">Save your profile first, then you can add a photo and portfolio items.</Alert>
        )}
      </div>
    </>
  );
}
