import { useState } from 'react';
import Avatar from '../../components/ui/Avatar';
import FileButton from '../../components/ui/FileButton';
import { Alert } from '../../components/ui/feedback';
import { useToast } from '../../context/ToastContext';
import { providerApi } from '../../services/providerApi';
import { errorMessage } from '../../utils/errors';

export const MAX_IMAGE_MB = 5;
export const checkImage = (file) => {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'Choose a JPEG, PNG or WebP image.';
  if (file.size > MAX_IMAGE_MB * 1024 * 1024) return `That image is larger than ${MAX_IMAGE_MB} MB. Choose a smaller one.`;
  return '';
};

export default function AvatarUploader({ profile, onUpdated }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const upload = async (file) => {
    const problem = checkImage(file);
    if (problem) { setError(problem); return; }
    setError('');
    setBusy(true);
    try {
      const { data } = await providerApi.uploadAvatar(file);
      onUpdated(data.profile);
      toast.success('Profile photo updated.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-5">
        <Avatar name={profile.displayName} src={profile.avatarUrl} size="xl" />
        <div>
          <FileButton onFile={upload} disabled={busy}>{busy ? 'Uploading…' : profile.avatarUrl ? 'Change photo' : 'Add a photo'}</FileButton>
          <p className="mt-2 text-sm text-ink-600">JPEG, PNG or WebP, up to {MAX_IMAGE_MB} MB.</p>
        </div>
      </div>
      {error && <Alert tone="error" className="mt-3">{error}</Alert>}
    </div>
  );
}
