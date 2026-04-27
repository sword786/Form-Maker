import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { doc, getDoc, collection, getDocs, updateDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { analyzeFormResults, customFormAnalysis } from '../lib/ai';
import { toast } from 'sonner';
import { Sparkles, ArrowLeft, RefreshCw, MessageSquare, Trash, Download } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Checkbox } from '../components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog"

export function FormResults() {
  const { formId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState<any>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [selectedSubmissions, setSelectedSubmissions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [customQuery, setCustomQuery] = useState('');
  const [customAnalysisResult, setCustomAnalysisResult] = useState('');
  const [analyzingCustom, setAnalyzingCustom] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'single' | 'all'; id?: string } | null>(null);


  useEffect(() => {
    if (!user) return;
    const fetchResults = async () => {
      try {
        const formRef = doc(db, 'forms', formId!);
        const formSnap = await getDoc(formRef);
        
        if (!formSnap.exists() || formSnap.data().creatorId !== user.uid) {
          toast.error("Not authorized");
          navigate('/');
          return;
        }
        
        setForm({ id: formSnap.id, ...formSnap.data() });

        fetchSubmissions();
      } catch (e) {
        handleFirestoreError(e, OperationType.GET, `forms/${formId}`);
      } finally {
        setLoading(false);
      }
    };
    fetchResults();
  }, [formId, user, navigate]);

  const fetchSubmissions = async () => {
    try {
      const subsRef = collection(db, 'forms', formId!, 'submissions');
      const subsSnap = await getDocs(subsRef);
      const subs: any[] = [];
      subsSnap.forEach(sub => subs.push({ id: sub.id, ...sub.data() }));
      setSubmissions(subs);
    } catch(e) {
      handleFirestoreError(e, OperationType.LIST, `forms/${formId}/submissions`);
    }
  };

  const runAnalysis = async () => {
    if (submissions.length === 0) {
      toast.info("No submissions yet to analyze.");
      return;
    }
    setAnalyzing(true);
    try {
      const qsForAi = form.questions.filter((q: any) => q.type !== 'section_header');
      const analysis = await analyzeFormResults(qsForAi, submissions);
      const formRef = doc(db, 'forms', formId!);
      await updateDoc(formRef, {
        aiAnalysis: analysis,
        updatedAt: serverTimestamp()
      });
      setForm({ ...form, aiAnalysis: analysis });
      toast.success("AI Analysis complete!");
    } catch (e) {
      console.error(e);
      toast.error("Failed to run AI analysis.");
    } finally {
      setAnalyzing(false);
    }
  };

  const runCustomAnalysis = async () => {
    if (!customQuery.trim() || submissions.length === 0) return;
    setAnalyzingCustom(true);
    try {
      const qsForAi = form.questions.filter((q: any) => q.type !== 'section_header');
      const result = await customFormAnalysis(qsForAi, submissions, customQuery);
      setCustomAnalysisResult(result || "No insights found.");
    } catch (e) {
      console.error(e);
      toast.error("Failed to run custom analysis.");
    } finally {
      setAnalyzingCustom(false);
    }
  };

  const handleDeleteSubmission = (subId: string) => {
    setDeleteTarget({ type: 'single', id: subId });
  };

  const handleDeleteAllSubmissions = () => {
    setDeleteTarget({ type: 'all' });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === 'single' && deleteTarget.id) {
         await deleteDoc(doc(db, 'forms', formId!, 'submissions', deleteTarget.id));
         toast.success("Submission deleted");
         setSubmissions(prev => prev.filter(s => s.id !== deleteTarget.id));
      } else if (deleteTarget.type === 'all') {
         for (const sub of submissions) {
            await deleteDoc(doc(db, 'forms', formId!, 'submissions', sub.id));
         }
         toast.success("All submissions deleted");
         setSubmissions([]);
      }
    } catch(e) {
      handleFirestoreError(e, OperationType.DELETE, `forms/${formId}/submissions/${deleteTarget.id || 'all'}`);
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleExportCSV = () => {
    const toExport = selectedSubmissions.size > 0 
      ? submissions.filter(s => selectedSubmissions.has(s.id))
      : submissions;
      
    if (toExport.length === 0) return;
    
    const headers = ['Date', ...form.questions.filter((q: any) => q.type !== 'section_header').map((q: any) => q.title)];
    
    const rows = toExport.map(sub => {
      const date = sub.submittedAt?.toDate ? sub.submittedAt.toDate().toLocaleString() : 'N/A';
      const answers = form.questions.filter((q: any) => q.type !== 'section_header').map((q: any) => {
        let val = sub.answers[q.id];
        if (Array.isArray(val)) val = val.join(', ');
        if (val === undefined || val === null) return '""';
        return `"${String(val).replace(/"/g, '""')}"`;
      });
      return [date, ...answers].join(',');
    });
    
    const csvContent = [headers.map(h => `"${String(h).replace(/"/g, '""')}"`).join(','), ...rows].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${form.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_results.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedSubmissions(new Set(submissions.map(s => s.id)));
    } else {
      setSelectedSubmissions(new Set());
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    const newSet = new Set(selectedSubmissions);
    if (checked) {
      newSet.add(id);
    } else {
      newSet.delete(id);
    }
    setSelectedSubmissions(newSet);
  };

  if (loading) return <div className="text-center py-20">Loading...</div>;
  if (!form) return <div className="text-center py-20">Form not found.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Results: {form.title}</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500 font-medium">Total Submissions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{submissions.length}</div>
          </CardContent>
        </Card>
      </div>

      {submissions.length > 0 && (
        <Card className="border-purple-200 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none">
            <Sparkles className="w-40 h-40 text-purple-600" />
          </div>
          <CardHeader>
            <div className="flex items-center justify-between z-10 relative">
              <CardTitle className="flex items-center space-x-2 text-purple-900">
                <Sparkles className="w-5 h-5" />
                <span>AI Insights</span>
              </CardTitle>
              <Button onClick={runAnalysis} disabled={analyzing} variant="outline" className="text-purple-600 border-purple-200 hover:bg-purple-50">
                {analyzing ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                {form.aiAnalysis ? 'Regenerate Analysis' : 'Analyze Now'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="z-10 relative">
            {!form.aiAnalysis ? (
              <div className="text-center py-10 text-gray-400">
                <p>Run AI Analysis to get a summary and categorization of the responses.</p>
              </div>
            ) : (
              <div className="space-y-8">
                <div>
                  <h3 className="font-semibold text-lg mb-2">Overall Summary</h3>
                  <div className="prose prose-sm prose-purple max-w-none text-gray-700 bg-white/50 p-4 rounded-xl border border-purple-50">
                    <ReactMarkdown>{form.aiAnalysis.summary || ''}</ReactMarkdown>
                  </div>
                </div>

                {form.aiAnalysis.categories && form.aiAnalysis.categories.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-lg mb-4">Themes & Categories</h3>
                    <div className="grid gap-4 md:grid-cols-2">
                      {form.aiAnalysis.categories.map((cat: any, i: number) => (
                        <div key={i} className="bg-white border rounded-xl p-4 shadow-sm">
                          <h4 className="font-medium text-purple-900 mb-2">{cat.theme}</h4>
                          <ul className="list-disc pl-5 text-sm text-gray-600 space-y-1">
                            {cat.notes && cat.notes.map((note: string, j: number) => (
                              <li key={j}>{note}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="pt-6 border-t border-purple-100">
                  <h3 className="font-semibold text-lg mb-4 flex items-center space-x-2">
                    <MessageSquare className="w-5 h-5 text-purple-600" />
                    <span>Ask AI About Your Results</span>
                  </h3>
                  <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 mb-4">
                    <Input 
                      placeholder="e.g. Which subject do students find most difficult?"
                      value={customQuery}
                      onChange={e => setCustomQuery(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') runCustomAnalysis();
                      }}
                      className="bg-white"
                    />
                    <Button onClick={runCustomAnalysis} disabled={analyzingCustom || !customQuery.trim() || submissions.length === 0} className="bg-purple-600 hover:bg-purple-700">
                      {analyzingCustom ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : 'Ask AI'}
                    </Button>
                  </div>
                  
                  {customAnalysisResult && (
                    <div className="bg-white p-4 rounded-xl border border-purple-100 shadow-sm mt-4">
                      <div className="prose prose-sm prose-purple max-w-none text-gray-700">
                        <ReactMarkdown>{customAnalysisResult}</ReactMarkdown>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {submissions.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Raw Responses ({submissions.length})</CardTitle>
            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm" onClick={handleExportCSV}>
                <Download className="w-4 h-4 mr-2" />
                Export CSV {selectedSubmissions.size > 0 ? `(${selectedSubmissions.size})` : '(All)'}
              </Button>
              <Button variant="destructive" size="sm" onClick={handleDeleteAllSubmissions}>Delete All Submissions</Button>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                <tr>
                  <th className="px-4 py-3 w-[40px]">
                    <Checkbox 
                      checked={selectedSubmissions.size === submissions.length && submissions.length > 0}
                      onCheckedChange={(checked) => handleSelectAll(checked as boolean)}
                    />
                  </th>
                  <th className="px-4 py-3 min-w-[150px]">Date</th>
                  {form.questions.filter((q: any) => q.type !== 'section_header').map((q: any) => (
                    <th key={q.id} className="px-4 py-3 min-w-[200px]">{q.title}</th>
                  ))}
                  <th className="px-4 py-3 w-[60px]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {submissions.map(sub => (
                  <tr key={sub.id} className="hover:bg-gray-50/50">
                     <td className="px-4 py-3">
                       <Checkbox 
                         checked={selectedSubmissions.has(sub.id)}
                         onCheckedChange={(checked) => handleSelectOne(sub.id, checked as boolean)}
                       />
                     </td>
                     <td className="px-4 py-3 text-gray-500">
                      {sub.submittedAt?.toDate ? sub.submittedAt.toDate().toLocaleString() : 'N/A'}
                    </td>
                    {form.questions.filter((q: any) => q.type !== 'section_header').map((q: any) => (
                      <td key={q.id} className="px-4 py-3">
                        {Array.isArray(sub.answers[q.id]) ? sub.answers[q.id].join(', ') : (sub.answers[q.id] || <span className="text-gray-300">-</span>)}
                      </td>
                    ))}
                    <td className="px-4 py-3">
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteSubmission(sub.id)}>
                        <Trash className="w-4 h-4 text-red-500" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Are you sure?</DialogTitle>
            <DialogDescription>
              {deleteTarget?.type === 'all' 
                ? "This will permanently delete ALL submissions. This action cannot be undone."
                : "This will permanently delete this submission. This action cannot be undone."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
