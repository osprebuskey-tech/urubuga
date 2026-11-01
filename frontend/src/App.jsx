import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { PageLoader } from './components/ui/Spinner';
import { router } from './routes';

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <RouterProvider router={router} fallbackElement={<PageLoader />} />
      </ToastProvider>
    </AuthProvider>
  );
}
