import { useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { collection, query, where, onSnapshot, doc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../components/ui/card';
import { Plus, Copy, Trash } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog"

interface Form {
  id: string;
  title: string;
  description?: string;
  createdAt: any;
}

export function Dashboard() {
  const { user } = useAuth();
  const [forms, setForms] = useState<Form[]>([]);
  const [loading, setLoading] = useState(true);
  const [formToDelete, setFormToDelete] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      setForms([]);
      setLoading(false);
      return;
    }
    const q = query(
      collection(db, 'forms'),
      where('creatorId', '==', user.uid)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loaded: Form[] = [];
      snapshot.forEach(document => {
        loaded.push({ id: document.id, ...document.data() } as Form);
      });
      // Sort in memory since we didn't add an index for creatorId + createdAt descending
      loaded.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis());
      setForms(loaded);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'forms');
    });

    return () => unsubscribe();
  }, [user]);

  const confirmDeleteForm = async () => {
    if (!formToDelete) return;
    try {
      await deleteDoc(doc(db, 'forms', formToDelete));
      toast.success('Form deleted successfully');
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `forms/${formToDelete}`);
    } finally {
      setFormToDelete(null);
    }
  };

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <h2 className="text-2xl font-bold tracking-tight">Welcome to AI Feedback Forms</h2>
        <p className="text-gray-500 max-w-md">Sign in to start creating intelligent, collective feedback forms powered by AI.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold tracking-tight">My Forms</h1>
        <Button onClick={() => navigate('/form/create/edit')}>
          <Plus className="w-4 h-4 mr-2" />
          Create Form
        </Button>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-10">Loading forms...</div>
      ) : forms.length === 0 ? (
        <div className="text-center bg-white border border-gray-200 border-dashed rounded-xl py-20 px-6">
          <h3 className="font-semibold text-gray-900">No forms yet</h3>
          <p className="text-sm text-gray-500 mt-1 mb-4">Create your first form to start collecting feedback.</p>
          <Button onClick={() => navigate('/form/create/edit')} variant="outline">
            Create Form
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {forms.map(form => (
            <Card key={form.id} className="flex flex-col hover:shadow-md transition-shadow">
              <CardHeader>
                <CardTitle>{form.title}</CardTitle>
                <CardDescription className="line-clamp-2">
                  {form.description || "No description"}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 text-sm text-gray-500">
                Created {form.createdAt?.toDate ? format(form.createdAt.toDate(), 'PPP') : 'Recently'}
              </CardContent>
              <CardFooter className="flex space-x-2 border-t bg-gray-50/50 pt-4 rounded-b-xl">
                <Button variant="secondary" size="sm" className="flex-1" onClick={() => navigate(`/form/${form.id}/edit`)}>Edit</Button>
                <Button variant="secondary" size="sm" className="flex-1" onClick={() => navigate(`/form/${form.id}/results`)}>Results</Button>
                <Button variant="outline" size="icon" onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/f/${form.id}`);
                  toast.success("Link copied!");
                }} title="Copy Link">
                   <Copy className="w-4 h-4 text-gray-600" />
                </Button>
                <Button variant="outline" size="icon" onClick={() => setFormToDelete(form.id)} title="Delete Form">
                   <Trash className="w-4 h-4 text-red-500" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => window.open(`/f/${form.id}`, '_blank')}>
                   View
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!formToDelete} onOpenChange={(open) => !open && setFormToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Are you sure?</DialogTitle>
            <DialogDescription>
              This will permanently delete this form and all its submissions. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormToDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDeleteForm}>Delete Form</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
