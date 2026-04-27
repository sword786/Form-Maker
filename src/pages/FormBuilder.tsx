import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { doc, getDoc, setDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Card, CardContent } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { Label } from '../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Trash, Sparkles, Plus, Copy, ArrowLeft, Settings, ArrowUp, ArrowDown, LayoutList, Wand2, Eye } from 'lucide-react';
import { generateFormQuestions, organizeFormQuestions } from '../lib/ai';
import { toast } from 'sonner';

type QuestionType = 'text' | 'multiple_choice' | 'scale' | 'section_header' | 'checkboxes' | 'dropdown';

interface Question {
  id: string;
  type: QuestionType;
  title: string;
  description?: string;
  options?: string[];
  required: boolean;
  allowOther?: boolean;
}

export function FormBuilder() {
  const { formId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [title, setTitle] = useState('Untitled Form');
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isAcceptingResponses, setIsAcceptingResponses] = useState(true);
  const [collectEmail, setCollectEmail] = useState(false);
  const [showProgressBar, setShowProgressBar] = useState(false);
  const [confirmationMessage, setConfirmationMessage] = useState('Your response has been recorded.');
  const [loading, setLoading] = useState(formId !== 'create');
  const [saving, setSaving] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [generating, setGenerating] = useState(false);
  
  const [organizing, setOrganizing] = useState(false);
  
  const [activeTab, setActiveTab] = useState('questions');

  useEffect(() => {
    if (formId === 'create' || !user) return;
    const fetchForm = async () => {
      try {
        const docRef = doc(db, 'forms', formId!);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().creatorId === user.uid) {
          const data = docSnap.data();
          setTitle(data.title);
          setDescription(data.description || '');
          setQuestions(data.questions || []);
          setIsAcceptingResponses(data.isAcceptingResponses ?? true);
          setCollectEmail(data.collectEmail ?? false);
          setShowProgressBar(data.showProgressBar ?? false);
          setConfirmationMessage(data.confirmationMessage || 'Your response has been recorded.');
        } else {
          toast.error("Form not found or you don't have permission.");
          navigate('/');
        }
      } catch (e) {
        handleFirestoreError(e, OperationType.GET, `forms/${formId}`);
      } finally {
        setLoading(false);
      }
    };
    fetchForm();
  }, [formId, user, navigate]);

  const saveForm = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const formRef = doc(db, 'forms', formId === 'create' ? Math.random().toString(36).substring(2, 12) : formId!);
      const formData = {
        title,
        description,
        questions,
        isAcceptingResponses,
        collectEmail,
        showProgressBar,
        confirmationMessage,
        creatorId: user.uid,
        updatedAt: serverTimestamp(),
      };

      if (formId === 'create') {
        const id = formRef.id;
        await setDoc(formRef, {
          ...formData,
          createdAt: serverTimestamp(),
        });
        toast.success("Form created successfully!");
        navigate(`/form/${id}/edit`);
      } else {
        await updateDoc(formRef, formData);
        toast.success("Form saved!");
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `forms`);
    } finally {
      setSaving(false);
    }
  };

  const generateWithAI = async () => {
    if (!aiPrompt.trim() && !file) return;
    setGenerating(true);
    try {
      let b64: string | undefined;
      let mime: string | undefined;
      if (file) {
        const buf = await file.arrayBuffer();
        b64 = btoa(new Uint8Array(buf).reduce((data, byte) => data + String.fromCharCode(byte), ''));
        mime = file.type;
      }
      
      const generated = await generateFormQuestions(aiPrompt || "Generate form from this image/document", b64, mime);
      if (generated && Array.isArray(generated)) {
        setQuestions(prev => [...prev, ...generated]);
        setAiPrompt('');
        setFile(null);
        toast.success("Questions added!");
      } else {
        toast.error("Failed to generate questions.");
      }
    } catch (e) {
      console.error(e);
      toast.error("Error generating from AI.");
    } finally {
      setGenerating(false);
    }
  };

  const addQuestion = () => {
    setQuestions([...questions, {
      id: Math.random().toString(36).substring(2, 9),
      type: 'text',
      title: '',
      required: false
    }]);
  };

  const updateQuestion = (index: number, updates: Partial<Question>) => {
    const newQs = [...questions];
    newQs[index] = { ...newQs[index], ...updates };
    setQuestions(newQs);
  };

  const removeQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const moveQuestion = (index: number, direction: 'up' | 'down') => {
    const newQuestions = [...questions];
    if (direction === 'up' && index > 0) {
      [newQuestions[index - 1], newQuestions[index]] = [newQuestions[index], newQuestions[index - 1]];
      setQuestions(newQuestions);
    } else if (direction === 'down' && index < newQuestions.length - 1) {
      [newQuestions[index + 1], newQuestions[index]] = [newQuestions[index], newQuestions[index + 1]];
      setQuestions(newQuestions);
    }
  };

  const removeDuplicates = () => {
    const seen = new Set();
    const unique = questions.filter(q => {
      const lowerTitle = q.title.trim().toLowerCase();
      if (seen.has(lowerTitle)) return false;
      seen.add(lowerTitle);
      return true;
    });
    setQuestions(unique);
    toast.success("Duplicate questions removed.");
  };

  const handleOrganizeWithAI = async () => {
    if (questions.length === 0) {
      toast.info("Add some questions first to organize them.");
      return;
    }
    setOrganizing(true);
    try {
      const organized = await organizeFormQuestions(title, description, questions);
      setQuestions(organized);
      toast.success("Questions organized and improved!");
    } catch (e) {
      toast.error("Failed to organize questions.");
    } finally {
      setOrganizing(false);
    }
  };

  if (loading) return <div className="text-center py-20">Loading...</div>;

  const copyLink = () => {
    const url = `${window.location.origin}/f/${formId}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copied to clipboard!");
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-20">
      <div className="flex justify-between items-center bg-white p-4 sticky top-16 z-10 border-b border-gray-100 -mx-4 sm:mx-0 sm:rounded-xl sm:border shadow-sm flex-wrap gap-4">
        <div className="flex items-center space-x-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h2 className="font-semibold text-lg">{formId === 'create' ? 'New Form' : 'Edit Form'}</h2>
        </div>
        <div className="flex flex-1 justify-center">
          {formId !== 'create' && (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-[400px]">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="questions">Questions</TabsTrigger>
                <TabsTrigger value="settings">Settings</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            {formId !== 'create' && (
              <>
                <Button onClick={() => window.open(`/f/${formId}`, '_blank')} variant="outline" size="sm">
                  <Eye className="w-4 h-4 mr-2" />
                  Preview
                </Button>
                <Button onClick={copyLink} variant="outline" size="sm">
                  <Copy className="w-4 h-4 mr-2" />
                  Copy Link
                </Button>
              </>
            )}
            <Button onClick={saveForm} size="sm" disabled={saving || questions.length === 0}>
              {saving ? 'Saving...' : 'Save Form'}
            </Button>
          </div>
        </div>
      </div>

      <div className={formId !== 'create' && activeTab === 'settings' ? 'hidden' : 'block'}>

      <Card className="border-t-4 border-t-purple-600">
        <CardContent className="pt-6 space-y-4">
          <Input 
            className="text-3xl font-bold border-0 border-b-2 rounded-none px-0 focus-visible:ring-0 focus-visible:border-purple-600 h-auto py-2"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Form Title"
          />
          <Textarea 
            className="border-0 border-b rounded-none px-0 focus-visible:ring-0 resize-none min-h-[40px]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Form description"
          />
        </CardContent>
      </Card>

      <Card className="bg-purple-50 border-purple-100">
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center space-x-2 text-purple-700">
            <Sparkles className="w-5 h-5" />
            <span className="font-medium">Generate questions with AI</span>
          </div>
          <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
            <Input 
              value={aiPrompt}
              onChange={e => setAiPrompt(e.target.value)}
              className="bg-white"
              placeholder="e.g. Generate 5 questions for a product feedback survey" 
            />
            <div className="relative shrink-0">
               <Input 
                 type="file" 
                 onChange={e => setFile(e.target.files?.[0] || null)}
                 className="absolute inset-0 opacity-0 cursor-pointer w-full"
                 accept="image/*,application/pdf"
               />
               <Button variant="outline" className="w-full sm:w-auto bg-white pointer-events-none">
                 {file ? file.name : 'Attach Image/Doc'}
               </Button>
            </div>
            <Button onClick={generateWithAI} disabled={generating || (!aiPrompt.trim() && !file)} variant="default" className="bg-purple-600 hover:bg-purple-700 shrink-0">
              {generating ? '...' : 'Generate'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <div className="flex justify-end space-x-2">
           <Button onClick={removeDuplicates} variant="outline" size="sm" disabled={questions.length === 0}>
             <LayoutList className="w-4 h-4 mr-2" />
             Remove Duplicates
           </Button>
           <Button onClick={handleOrganizeWithAI} variant="outline" size="sm" disabled={organizing || questions.length === 0}>
             <Wand2 className="w-4 h-4 mr-2" />
             {organizing ? 'Organizing...' : 'Organize with AI'}
           </Button>
        </div>
        {questions.map((q, i) => (
          <Card key={q.id} className={q.type === 'section_header' ? 'border-t-4 border-t-purple-400 bg-purple-50/20' : ''}>
            <CardContent className="pt-6 space-y-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <Input 
                  className="flex-1 font-medium bg-gray-50 focus:bg-white"
                  value={q.title}
                  onChange={(e) => updateQuestion(i, { title: e.target.value })}
                  placeholder="Question title"
                />
                <Select value={q.type} onValueChange={(v: QuestionType) => updateQuestion(i, { type: v })}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Text Response</SelectItem>
                    <SelectItem value="multiple_choice">Multiple Choice</SelectItem>
                    <SelectItem value="checkboxes">Checkboxes</SelectItem>
                    <SelectItem value="dropdown">Dropdown</SelectItem>
                    <SelectItem value="scale">Linear Scale (1-5)</SelectItem>
                    <SelectItem value="section_header">Section Header</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {q.type === 'section_header' && (
                <div className="pt-2">
                  <Textarea 
                    className="flex-1 bg-gray-50 focus:bg-white resize-none min-h-[60px]"
                    value={q.description || ''}
                    onChange={(e) => updateQuestion(i, { description: e.target.value })}
                    placeholder="Section description (optional)"
                  />
                </div>
              )}

              {q.type !== 'section_header' && q.type !== 'text' && q.type !== 'scale' && (
                <div className="space-y-2 pl-4 border-l-2 border-gray-200 ml-2">
                  {(q.options || ['Option 1']).map((opt, optIndex) => (
                    <div key={optIndex} className="flex items-center space-x-2">
                      <div className="w-4 h-4 rounded-full border border-gray-300 shrink-0" />
                      <Input 
                        value={opt}
                        onChange={(e) => {
                          const newOpts = [...(q.options || [])];
                          newOpts[optIndex] = e.target.value;
                          updateQuestion(i, { options: newOpts });
                        }}
                        className="h-8 border-none bg-transparent hover:bg-gray-50 focus-visible:ring-0 px-2"
                      />
                      <Button variant="ghost" size="sm" onClick={() => {
                        const newOpts = [...(q.options || [])];
                        newOpts.splice(optIndex, 1);
                        updateQuestion(i, { options: newOpts });
                      }}>
                        <Trash className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  ))}
                  
                  {q.allowOther && (q.type === 'multiple_choice' || q.type === 'checkboxes') && (
                    <div className="flex items-center space-x-2 text-gray-500">
                       <div className="w-4 h-4 rounded-full border border-gray-300 shrink-0" />
                       <span className="px-3 h-8 flex items-center border-b border-gray-200 flex-1">Other...</span>
                       <Button variant="ghost" size="sm" onClick={() => updateQuestion(i, { allowOther: false })}>
                         <Trash className="w-4 h-4 text-red-500" />
                       </Button>
                    </div>
                  )}

                  <div className="flex items-center space-x-2">
                    <Button variant="ghost" size="sm" onClick={() => {
                      updateQuestion(i, { options: [...(q.options || []), `Option ${(q.options?.length || 0) + 1}`] })
                    }}>
                      Add Option
                    </Button>
                    {(!q.allowOther) && (q.type === 'multiple_choice' || q.type === 'checkboxes') && (
                      <>
                        <span className="text-gray-400">or</span>
                        <Button variant="ghost" size="sm" onClick={() => updateQuestion(i, { allowOther: true })} className="text-blue-600 hover:text-blue-700 hover:bg-blue-50">
                          add "Other"
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-end items-center pt-4 border-t space-x-6">
                {q.type !== 'section_header' && (
                  <div className="flex items-center space-x-2">
                    <Label htmlFor={`req-${i}`}>Required</Label>
                    <Switch 
                      id={`req-${i}`} 
                      checked={q.required} 
                      onCheckedChange={(c) => updateQuestion(i, { required: c })} 
                    />
                  </div>
                )}
                <Button variant="ghost" size="icon" onClick={() => removeQuestion(i)}>
                  <Trash className="w-4 h-4 text-red-500" />
                </Button>
                <div className="flex bg-gray-100 rounded-md overflow-hidden">
                  <Button variant="ghost" size="sm" className="rounded-none px-2 h-8" onClick={() => moveQuestion(i, 'up')} disabled={i === 0}>
                    <ArrowUp className="w-3 h-3 text-gray-700" />
                  </Button>
                  <Button variant="ghost" size="sm" className="rounded-none px-2 h-8" onClick={() => moveQuestion(i, 'down')} disabled={i === questions.length - 1}>
                    <ArrowDown className="w-3 h-3 text-gray-700" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex justify-center">
        <Button onClick={addQuestion} variant="outline" size="lg" className="rounded-full shadow-sm">
          <Plus className="w-5 h-5 mr-2" />
          Add Question
        </Button>
      </div>
      </div>

      <div className={formId !== 'create' && activeTab === 'settings' ? 'block' : 'hidden'}>
        <div className="space-y-6">
           <Card>
             <CardContent className="pt-6 space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">Accept Responses</Label>
                    <p className="text-sm text-gray-500">Allow users to submit new responses.</p>
                  </div>
                  <Switch 
                    checked={isAcceptingResponses} 
                    onCheckedChange={setIsAcceptingResponses} 
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">Collect Email Addresses</Label>
                    <p className="text-sm text-gray-500">Automatically require respondents to enter their email.</p>
                  </div>
                  <Switch 
                    checked={collectEmail} 
                    onCheckedChange={setCollectEmail} 
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">Show Progress Bar</Label>
                    <p className="text-sm text-gray-500">Show a progress bar at the bottom of the form for multi-section forms.</p>
                  </div>
                  <Switch 
                    checked={showProgressBar} 
                    onCheckedChange={setShowProgressBar} 
                  />
                </div>

                <div className="space-y-2 pt-2 border-t">
                  <Label className="text-base">Confirmation Message</Label>
                  <p className="text-sm text-gray-500">Message respondents see after submitting the form.</p>
                  <Input 
                    value={confirmationMessage} 
                    onChange={e => setConfirmationMessage(e.target.value)} 
                    placeholder="e.g. Thanks for your time!"
                  />
                </div>
             </CardContent>
           </Card>
        </div>
      </div>
    </div>
  );
}
