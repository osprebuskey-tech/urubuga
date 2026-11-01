import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import { PageLoader } from '../../components/ui/Spinner';
import { Alert, ErrorState } from '../../components/ui/feedback';
import ListingForm from '../../features/listings/ListingForm';
import ImageManager from '../../features/listings/ImageManager';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { useCategories } from '../../hooks/useCategories';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { catalogApi } from '../../services/catalogApi';
import { providerApi } from '../../services/providerApi';

export default function ServiceEditorPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  useDocumentTitle(isEdit ? 'Edit service' : 'New service');
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { categories, loading: catsLoading, error: catsError } = useCategories();
  const existing = useAsync((signal) => (isEdit ? catalogApi.getService(id, signal) : Promise.resolve({ data: null })), [id]);
  const [images, setImages] = useState(null);

  if (catsLoading || existing.loading) return <PageLoader label="Loading" />;
  if (catsError) return <ErrorState error={catsError} onRetry={() => window.location.reload()} />;
  if (existing.error) {
    return existing.error.status === 404
      ? <Alert tone="error" title="Listing not found">It may have been archived, or it isn’t yours. <Link to="/dashboard/provider/services" className="font-semibold underline">Back to your services</Link></Alert>
      : <ErrorState error={existing.error} onRetry={existing.reload} />;
  }

  const listing = existing.data?.service ?? null;

  const save = async (body) => {
    if (isEdit) {
      await providerApi.updateService(id, body);
      toast.success('Listing saved.');
      navigate('/dashboard/provider/services');
    } else {
      const { data } = await providerApi.createService(body);
      toast.success('Listing created. Add some photos next.');
      navigate(`/dashboard/provider/services/${data.service.id}/edit`);
    }
  };

  return (
    <>
      <PageHeader
        title={isEdit ? 'Edit service' : 'New service'}
        description={isEdit ? 'Changes appear in search as soon as you save.' : 'Describe what you offer. You can add photos after saving.'}
        actions={isEdit && listing?.status === 'active' ? <Link to={`/services/${id}`} className="font-semibold text-teal-700 underline">View public page</Link> : null}
      />
      <div className="space-y-8">
        <ListingForm
          listing={listing}
          categories={categories}
          onSubmit={save}
          submitLabel={isEdit ? 'Save changes' : 'Create listing'}
          blocked={!isEdit && !user.emailVerified ? 'Confirm your email address before creating a listing. Check your inbox for the link.' : ''}
        />
        {isEdit && (
          <ImageManager
            images={images ?? listing.images}
            onChange={setImages}
            upload={async (file) => (await providerApi.addServiceImage(id, file)).data.service.images}
            remove={(imageId) => providerApi.removeServiceImage(id, imageId)}
            hint="Show your work. The first photo is the cover. Up to 8 photos."
            max={8}
          />
        )}
      </div>
    </>
  );
}
