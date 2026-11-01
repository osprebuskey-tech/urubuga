import { Link, useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import { PageLoader } from '../../components/ui/Spinner';
import { Alert, ErrorState } from '../../components/ui/feedback';
import RequestForm from '../../features/requests/RequestForm';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { useCategories } from '../../hooks/useCategories';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { requestApi } from '../../services/requestApi';

export default function RequestEditPage() {
  useDocumentTitle('Edit request');
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { categories, loading: catsLoading } = useCategories();
  const loaded = useAsync((signal) => requestApi.get(id, signal), [id]);

  if (catsLoading || loaded.loading) return <PageLoader label="Loading" />;
  if (loaded.error) return <ErrorState error={loaded.error} onRetry={loaded.reload} />;
  const request = loaded.data.request;

  if (!request.isOwner || request.status !== 'open' || request.quotationCount > 0) {
    return (
      <Alert tone="warning" title="This request can’t be edited">
        Requests can only be changed while they’re open and have no quotations yet. Otherwise providers would be pricing a job that later changed.
        {' '}<Link to={`/dashboard/requests/${id}`} className="font-semibold underline">Back to the request</Link>
      </Alert>
    );
  }

  const save = async (body) => {
    await requestApi.update(id, body);
    toast.success('Request updated.');
    navigate(`/dashboard/requests/${id}`);
  };

  return (
    <>
      <PageHeader title="Edit request" description="Clearing an optional field isn’t possible yet; replace its value instead." />
      <RequestForm request={request} categories={categories} onSubmit={save} submitLabel="Save changes" />
    </>
  );
}
