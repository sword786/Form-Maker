import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './lib/AuthContext';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { FormBuilder } from './pages/FormBuilder';
import { FormViewer } from './pages/FormViewer';
import { FormResults } from './pages/FormResults';
import { Toaster } from './components/ui/sonner';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="form/:formId/edit" element={<FormBuilder />} />
            <Route path="form/:formId/results" element={<FormResults />} />
          </Route>
          <Route path="/f/:formId" element={<FormViewer />} />
        </Routes>
        <Toaster position="top-center" richColors />
      </BrowserRouter>
    </AuthProvider>
  );
}
