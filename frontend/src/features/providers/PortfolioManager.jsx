import { useEffect, useState } from 'react';
import Button from '../../components/ui/Button';
import FileButton from '../../components/ui/FileButton';
import { TextAreaField, TextField } from '../../components/ui/Field';
import { Alert } from '../../components/ui/feedback';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { useToast } from '../../context/ToastContext';
import { providerApi } from '../../services/providerApi';
import { errorMessage, fieldErrors } from '../../utils/errors';
import { checkImage } from './AvatarUploader';

const MAX_ITEMS = 20;

export default function PortfolioManager({ profile, onUpdated }) {
  const toast = useToast();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  useEffect(() => {
    if (!file) { setPreview(''); return undefined; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const choose = (f) => {
    const problem = checkImage(f);
    if (problem) { setFormError(problem); return; }
    setFormError('');
    setFile(f);
  };

  const add = async (e) => {
    e.preventDefault();
    setFormError('');
    const found = {};
    if (!file) found.image = 'Choose an image first';
    if (title.trim().length < 2) found.title = 'Give it a title of at least 2 characters';
    setErrors(found);
    if (Object.keys(found).length) return;

    setBusy(true);
    try {
      const { data } = await providerApi.addPortfolio({ file, title: title.trim(), description: description.trim() });
      onUpdated(data.profile);
      setFile(null); setTitle(''); setDescription('');
      toast.success('Added to your portfolio.');
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setRemoveBusy(true);
    try {
      await providerApi.removePortfolio(removing.id);
      onUpdated({ ...profile, portfolio: profile.portfolio.filter((i) => i.id !== removing.id) });
      toast.success('Removed from your portfolio.');
      setRemoving(null);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRemoveBusy(false);
    }
  };

  const full = profile.portfolio.length >= MAX_ITEMS;

  return (
    <div>
      {profile.portfolio.length > 0 && (
        <ul className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {profile.portfolio.map((item) => (
            <li key={item.id} className="panel overflow-hidden">
              <img src={item.imageUrl} alt={item.title} className="aspect-[4/3] w-full object-cover" />
              <div className="p-3">
                <p className="font-semibold">{item.title}</p>
                {item.description && <p className="mt-0.5 line-clamp-2 text-sm text-ink-700">{item.description}</p>}
                <Button variant="danger" size="sm" className="mt-3" onClick={() => setRemoving(item)}>Remove<span className="sr-only"> {item.title}</span></Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {full ? <Alert tone="info">You’ve reached the limit of {MAX_ITEMS} portfolio items. Remove one to add another.</Alert> : (
        <form onSubmit={add} noValidate className="panel space-y-4 p-5">
          <h3 className="font-semibold">Add a portfolio item</h3>
          {formError && <Alert tone="error">{formError}</Alert>}
          <div className="flex flex-wrap items-center gap-4">
            <FileButton onFile={choose} disabled={busy}>{file ? 'Choose a different image' : 'Choose image'}</FileButton>
            {preview && <img src={preview} alt="Preview of the chosen image" className="h-20 w-28 rounded-lg object-cover" />}
            {errors.image && <p role="alert" className="text-sm font-medium text-rose-700">{errors.image}</p>}
          </div>
          <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} maxLength={100} required />
          <TextAreaField label="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} error={errors.description} maxLength={500} rows={3} hint="What was the job, and what did you do?" />
          <Button type="submit" loading={busy}>Add to portfolio</Button>
        </form>
      )}

      <ConfirmDialog open={Boolean(removing)} onClose={() => setRemoving(null)} onConfirm={remove} loading={removeBusy} title="Remove this item?" confirmLabel="Remove" danger>
        <p>“{removing?.title}” will be deleted from your portfolio and can’t be restored.</p>
      </ConfirmDialog>
    </div>
  );
}
