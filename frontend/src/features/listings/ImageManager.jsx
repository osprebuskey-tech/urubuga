import { useState } from 'react';
import Button from '../../components/ui/Button';
import FileButton from '../../components/ui/FileButton';
import { Alert } from '../../components/ui/feedback';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { useToast } from '../../context/ToastContext';
import { errorMessage } from '../../utils/errors';
import { checkImage } from '../providers/AvatarUploader';

/**
 * A photo grid with add and remove.
 * - upload(file) must resolve the new full list of images ([{ id, url }])
 * - remove(imageId) must resolve once the image is deleted
 */
export default function ImageManager({ images, onChange, upload, remove, title = 'Photos', hint, max = 8 }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  const add = async (file) => {
    const problem = checkImage(file);
    if (problem) { setError(problem); return; }
    setError('');
    setBusy(true);
    try {
      onChange(await upload(file));
      toast.success('Photo added.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const confirmRemove = async () => {
    setRemoveBusy(true);
    try {
      await remove(removing.id);
      onChange(images.filter((i) => i.id !== removing.id));
      toast.success('Photo removed.');
      setRemoving(null);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRemoveBusy(false);
    }
  };

  return (
    <section className="panel p-6" aria-labelledby="photos">
      <h2 id="photos" className="text-xl font-semibold">{title}</h2>
      {hint && <p className="mt-1 text-ink-700">{hint}</p>}
      {error && <Alert tone="error" className="mt-3">{error}</Alert>}
      {images.length > 0 && (
        <ul className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((img, i) => (
            <li key={img.id} className="overflow-hidden rounded-lg border border-ink-100">
              <img src={img.url} alt={`Photo ${i + 1}`} className="aspect-[4/3] w-full object-cover" />
              <div className="p-2"><Button variant="danger" size="sm" className="w-full" onClick={() => setRemoving(img)}>Remove<span className="sr-only"> photo {i + 1}</span></Button></div>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4">
        {images.length >= max ? <p className="text-sm text-ink-700">You’ve added the maximum number of photos ({max}).</p> : <FileButton onFile={add} disabled={busy}>{busy ? 'Uploading…' : 'Add a photo'}</FileButton>}
      </div>
      <ConfirmDialog open={Boolean(removing)} onClose={() => setRemoving(null)} onConfirm={confirmRemove} loading={removeBusy} title="Remove this photo?" confirmLabel="Remove" danger>
        <p>The photo will be deleted.</p>
      </ConfirmDialog>
    </section>
  );
}
