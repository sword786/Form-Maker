import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '../components/ui/radio-group';
import { Label } from '../components/ui/label';
import { Progress } from '../components/ui/progress';
import { Checkbox } from '../components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';

export function FormViewer() {
  const { formId } = useParams();
  const { user } = useAuth();
  const [form, setForm] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [respondentEmail, setRespondentEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);

  const [viewingResponse, setViewingResponse] = useState(false);

  useEffect(() => {
    const fetchForm = async () => {
      try {
        const docRef = doc(db, 'forms', formId!);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setForm({ id: docSnap.id, ...docSnap.data() });
        } else {
          setForm(null);
        }
      } catch (e) {
        handleFirestoreError(e, OperationType.GET, `forms/${formId}`);
      } finally {
        setLoading(false);
      }
    };
    fetchForm();
  }, [formId]);

  const pages = useMemo(() => {
    if (!form?.questions) return [];
    
    // Split into pages based on section_headers
    const pgs: Array<{ header?: any, questions: any[] }> = [];
    let currentQuestions: any[] = [];
    let currentHeader: any = null;

    form.questions.forEach((q: any) => {
      if (q.type === 'section_header') {
        if (currentQuestions.length > 0 || currentHeader) {
          pgs.push({ header: currentHeader, questions: currentQuestions });
        } else if (pgs.length === 0) {
          // If the very first thing is a section header, just skip putting the empty dummy page
        }
        currentHeader = q;
        currentQuestions = [];
      } else {
        currentQuestions.push(q);
      }
    });

    if (currentQuestions.length > 0 || currentHeader) {
      pgs.push({ header: currentHeader, questions: currentQuestions });
    }

    if (pgs.length === 0) {
       // fallback for empty forms
       pgs.push({ questions: [] });
    }
    
    return pgs;
  }, [form]);

  const validatePage = () => {
    const pageData = pages[currentPage];
    const missing = pageData.questions.filter((q: any) => {
      if (!q.required) return false;
      const val = answers[q.id];
      if (val === undefined || val === null) return true;
      if (typeof val === 'string' && val.trim() === '') return true;
      if (Array.isArray(val) && val.filter((v: string) => v.trim() !== '').length === 0) return true;
      return false;
    });
    
    if (missing.length > 0) {
      toast.error('Please fill in all required fields on this page.');
      const firstMissingId = missing[0].id;
      const el = document.getElementById(`question-${firstMissingId}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (!validatePage()) return;
    setCurrentPage(p => p + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePrevious = () => {
    setCurrentPage(p => Math.max(0, p - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validatePage()) return;
    
    if (form.collectEmail && !respondentEmail) {
      toast.error('Please provide your email address.');
      const el = document.getElementById(`respondent-email-input`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setSubmitting(true);
    
    try {
      const submissionId = Math.random().toString(36).substring(2, 12);
      const subRef = doc(db, 'forms', form.id, 'submissions', submissionId);
      
      const cleanedAnswers = { ...answers };
      for (const key in cleanedAnswers) {
        if (Array.isArray(cleanedAnswers[key])) {
          cleanedAnswers[key] = cleanedAnswers[key].filter((v: string) => v.trim() !== '');
        }
      }

      const payload: any = {
        answers: cleanedAnswers,
        submittedAt: serverTimestamp(),
      };
      if (user) {
        payload.submitterId = user.uid;
      }
      if (form.collectEmail && respondentEmail) {
        payload.respondentEmail = respondentEmail;
      }

      await setDoc(subRef, payload);
      setSubmitted(true);
      toast.success("Form submitted successfully!");
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `forms/${form.id}/submissions`);
      toast.error("Failed to submit.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="text-center py-20 bg-gray-50 min-h-screen">Loading...</div>;
  if (!form) return <div className="text-center py-20 text-red-500 bg-gray-50 min-h-screen">Form not found.</div>;

  if (form.isAcceptingResponses === false) {
    return (
      <div className="bg-gray-50 min-h-screen pt-20 px-4">
        <div className="max-w-2xl mx-auto">
          <Card className="text-center py-16 border-t-8 border-t-gray-500 shadow-md">
            <CardHeader>
              <CardTitle className="text-3xl text-gray-900">{form.title}</CardTitle>
              <CardDescription className="text-lg mt-4 text-red-600 font-medium">This form is no longer accepting responses.</CardDescription>
              <p className="text-sm mt-4 text-gray-500">Contact the creator of the form if you think this is a mistake.</p>
            </CardHeader>
          </Card>
        </div>
      </div>
    );
  }

  if (submitted) {
    if (viewingResponse) {
      return (
        <div className="bg-gray-50 min-h-screen pt-10 pb-20 px-4">
          <div className="max-w-3xl mx-auto space-y-6">
            <Card className="border-t-8 border-t-purple-600 shadow-sm border-x-0 sm:border-x sm:border-b">
              <CardHeader className="pt-8 pb-8 px-6 sm:px-8">
                <CardTitle className="text-3xl sm:text-4xl leading-tight font-bold text-gray-900 tracking-tight">{form.title}</CardTitle>
                <CardDescription className="text-base sm:text-lg mt-4 whitespace-pre-wrap text-gray-700">Your Response</CardDescription>
              </CardHeader>
            </Card>

            <div className="space-y-6">
              {form.questions.map((q: any) => {
                if (q.type === 'section_header') return null;
                const ans = answers[q.id];
                const displayAns = Array.isArray(ans) ? ans.join(', ') : ans;
                return (
                  <Card key={q.id} className="shadow-sm">
                    <CardContent className="pt-6 sm:pt-8 px-6 sm:px-8 space-y-2">
                      <Label className="text-base font-medium text-gray-900 leading-snug">{q.title}</Label>
                      <div className="pt-2">
                        {displayAns ? (
                          <p className="text-gray-700 whitespace-pre-wrap">{displayAns}</p>
                        ) : (
                          <p className="text-gray-400 italic">No answer provided</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="bg-gray-50 min-h-screen pt-20 px-4">
        <div className="max-w-2xl mx-auto">
          <Card className="text-center py-16 border-t-8 border-t-purple-600 shadow-md">
            <CardHeader>
              <CardTitle className="text-3xl text-gray-900">Thank You!</CardTitle>
              <CardDescription className="text-lg mt-2 whitespace-pre-wrap">
                {form.confirmationMessage || 'Your response has been recorded.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <Button variant="outline" onClick={() => setViewingResponse(true)}>
                View your response
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const isFirstPage = currentPage === 0;
  const isLastPage = currentPage === pages.length - 1;
  const currentData = pages[currentPage];
  const progressPercent = pages.length > 1 ? ((currentPage + 1) / pages.length) * 100 : 100;

  return (
    <div className="bg-gray-50 min-h-screen pt-10 pb-20 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        {isFirstPage && (
          <Card className="border-t-8 border-t-purple-600 shadow-sm border-x-0 sm:border-x sm:border-b">
            <CardHeader className="pt-8 pb-8 px-6 sm:px-8">
              <CardTitle className="text-3xl sm:text-4xl leading-tight font-bold text-gray-900 tracking-tight">{form.title}</CardTitle>
              {form.description && <CardDescription className="text-base sm:text-lg mt-4 whitespace-pre-wrap text-gray-700">{form.description}</CardDescription>}
            </CardHeader>
          </Card>
        )}

        {isFirstPage && form.collectEmail && (
          <Card className="shadow-sm border-x-0 sm:border-x sm:border-b transition-colors duration-200">
             <CardContent className="pt-6 sm:pt-8 px-6 sm:px-8 space-y-4">
                <div className="flex gap-1 mb-2">
                  <Label className="text-base font-medium text-gray-900 leading-snug">Email</Label>
                  <span className="text-red-500 font-semibold">*</span>
                </div>
                <Input 
                  id="respondent-email-input"
                  type="email"
                  placeholder="Your email address"
                  value={respondentEmail}
                  onChange={(e) => setRespondentEmail(e.target.value)}
                  className="border-0 border-b border-gray-300 rounded-none focus-visible:ring-0 focus-visible:border-purple-600 px-0 shadow-none text-base bg-transparent"
                  required
                />
                <p className="text-xs text-gray-500">Your email will be recorded with this submission.</p>
             </CardContent>
          </Card>
        )}

        {currentData?.header && (
          <div className="pt-6 pb-2 border-b-2 border-purple-100 mt-8 mb-4 px-2 sm:px-0">
            <h3 className="text-2xl font-semibold text-gray-900">{currentData.header.title}</h3>
            {currentData.header.description && <p className="text-gray-600 mt-2 whitespace-pre-wrap">{currentData.header.description}</p>}
          </div>
        )}

        <form onSubmit={(e) => { e.preventDefault(); if (isLastPage) { handleSubmit(e); } else { handleNext(); } }} className="space-y-6">
          {currentData?.questions.map((q: any) => (
            <Card key={q.id} id={`question-${q.id}`} className={`shadow-sm border-x-0 sm:border-x sm:border-y transition-colors duration-200 ${answers[q.id] === undefined && q.required ? "hover:border-purple-300" : ""}`}>
              <CardContent className="pt-6 sm:pt-8 px-6 sm:px-8 space-y-6">
                <div className="flex gap-1 mb-2">
                  <Label className="text-base font-medium text-gray-900 leading-snug">{q.title}</Label>
                  {q.required && <span className="text-red-500 font-semibold">*</span>}
                </div>
                
                {q.type === 'text' && (
                  <Textarea 
                    placeholder="Your answer"
                    value={answers[q.id] || ''}
                    onChange={e => setAnswers({ ...answers, [q.id]: e.target.value })}
                    className="border-0 border-b border-gray-300 rounded-none focus-visible:ring-0 focus-visible:border-purple-600 px-0 pb-2 shadow-none resize-none min-h-[40px] text-base"
                  />
                )}

                {q.type === 'multiple_choice' && (
                  <RadioGroup 
                    value={(q.allowOther && answers[q.id] !== undefined && !q.options.includes(answers[q.id])) ? '__other__' : (answers[q.id] || '')} 
                    onValueChange={v => {
                      if (v === '__other__') {
                        setAnswers({ ...answers, [q.id]: '' });
                      } else {
                        setAnswers({ ...answers, [q.id]: v });
                      }
                    }}
                    className="space-y-3"
                  >
                    {(q.options || []).map((opt: string, i: number) => (
                      <div className="flex items-center space-x-3" key={i}>
                        <RadioGroupItem value={opt} id={`${q.id}-${i}`} className="w-5 h-5 text-purple-600 border-gray-300" />
                        <Label htmlFor={`${q.id}-${i}`} className="font-normal text-base text-gray-700 cursor-pointer">{opt}</Label>
                      </div>
                    ))}
                    {q.allowOther && (
                      <div className="flex items-center space-x-3">
                        <RadioGroupItem value="__other__" id={`${q.id}-other`} className="w-5 h-5 text-purple-600 border-gray-300" />
                        <Label htmlFor={`${q.id}-other`} className="font-normal text-base text-gray-700 cursor-pointer">Other:</Label>
                        <Input 
                          value={(answers[q.id] !== undefined && !q.options.includes(answers[q.id])) ? answers[q.id] : ''}
                          onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                          onFocus={() => {
                             if (answers[q.id] === undefined || q.options.includes(answers[q.id])) {
                               setAnswers({ ...answers, [q.id]: '' });
                             }
                          }}
                          className="flex-1 border-0 border-b border-gray-300 rounded-none focus-visible:ring-0 focus-visible:border-purple-600 px-0 h-8 shadow-none" 
                        />
                      </div>
                    )}
                  </RadioGroup>
                )}

                {q.type === 'checkboxes' && (() => {
                  const hasOther = q.allowOther && (answers[q.id] || []).some((v: string) => !q.options.includes(v));
                  const otherValue = hasOther ? (answers[q.id] || []).find((v: string) => !q.options.includes(v)) : '';
                  
                  return (
                    <div className="space-y-3">
                      {(q.options || []).map((opt: string, i: number) => (
                        <div className="flex items-center space-x-3" key={i}>
                          <Checkbox 
                            id={`${q.id}-${i}`} 
                            className="w-5 h-5 text-purple-600 border-gray-300"
                            checked={(answers[q.id] || []).includes(opt)}
                            onCheckedChange={(checked) => {
                              const current = [...(answers[q.id] || [])];
                              if (checked) {
                                if (!current.includes(opt)) current.push(opt);
                              } else {
                                const index = current.indexOf(opt);
                                if (index > -1) current.splice(index, 1);
                              }
                              setAnswers({ ...answers, [q.id]: current });
                            }}
                          />
                          <Label htmlFor={`${q.id}-${i}`} className="font-normal text-base text-gray-700 cursor-pointer">{opt}</Label>
                        </div>
                      ))}
                      {q.allowOther && (
                        <div className="flex items-center space-x-3">
                           <Checkbox 
                             id={`${q.id}-other`}
                             className="w-5 h-5 text-purple-600 border-gray-300"
                             checked={hasOther}
                             onCheckedChange={(checked) => {
                               let current = [...(answers[q.id] || [])].filter((v: string) => q.options.includes(v));
                               if (checked) {
                                 current.push('');
                               }
                               setAnswers({ ...answers, [q.id]: current });
                             }}
                           />
                           <Label htmlFor={`${q.id}-other`} className="font-normal text-base text-gray-700 cursor-pointer">Other:</Label>
                           <Input 
                             value={hasOther ? otherValue : ''}
                             onChange={(e) => {
                               let current = [...(answers[q.id] || [])].filter((v: string) => q.options.includes(v));
                               current.push(e.target.value);
                               setAnswers({ ...answers, [q.id]: current });
                             }}
                             onFocus={() => {
                               if (!hasOther) {
                                 let current = [...(answers[q.id] || [])].filter((v: string) => q.options.includes(v));
                                 current.push('');
                                 setAnswers({ ...answers, [q.id]: current });
                               }
                             }}
                             className="flex-1 border-0 border-b border-gray-300 rounded-none focus-visible:ring-0 focus-visible:border-purple-600 px-0 h-8 shadow-none"
                           />
                        </div>
                      )}
                    </div>
                  );
                })()}

                {q.type === 'dropdown' && (
                  <Select 
                    value={answers[q.id] || ''} 
                    onValueChange={v => setAnswers({ ...answers, [q.id]: v })}
                  >
                    <SelectTrigger className="w-full text-base py-6 focus:ring-purple-600">
                      <SelectValue placeholder="Choose" />
                    </SelectTrigger>
                    <SelectContent>
                      {(q.options || []).map((opt: string, i: number) => (
                        <SelectItem key={i} value={opt} className="text-base py-3">{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {q.type === 'scale' && (
                  <div className="flex items-center justify-between sm:justify-start sm:space-x-8 pt-4 pb-2">
                    {[1, 2, 3, 4, 5].map(i => (
                      <div key={i} className="flex flex-col items-center">
                        <Label htmlFor={`${q.id}-${i}`} className="mb-3 font-medium text-gray-600 cursor-pointer">{i}</Label>
                        <input 
                          type="radio" 
                          id={`${q.id}-${i}`} 
                          name={`scale-${q.id}`} 
                          value={i} 
                          checked={answers[q.id] === i.toString()}
                          onChange={() => setAnswers({ ...answers, [q.id]: i.toString() })}
                          className="w-5 h-5 text-purple-600 border-gray-300 focus:ring-purple-600 cursor-pointer"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}

          <div className="flex justify-between items-center pt-6 px-2 sm:px-0">
            <div className="flex space-x-3">
              {!isFirstPage && (
                <Button type="button" variant="outline" size="lg" onClick={handlePrevious} className="text-gray-700">
                  Back
                </Button>
              )}
            </div>
            
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-500 font-medium">Page {currentPage + 1} of {pages.length}</span>
              {isLastPage ? (
                <Button type="submit" size="lg" disabled={submitting} className="bg-purple-600 hover:bg-purple-700 shadow-md transition-all">
                  {submitting ? 'Submitting...' : 'Submit'}
                </Button>
              ) : (
                <Button type="button" onClick={handleNext} size="lg" className="bg-purple-600 hover:bg-purple-700 shadow-md transition-all">
                  Next
                </Button>
              )}
            </div>
          </div>
          
          <div className="pt-4 text-right px-2 sm:px-0">
             {!user && <p className="text-xs text-gray-400 font-medium tracking-wide uppercase">Submitting anonymously</p>}
          </div>

          {form.showProgressBar && form.questions?.some((q: any) => q.type === 'section_header') && (
            <div className="pt-8 px-2 sm:px-0 pb-4">
              <Progress value={progressPercent} className="h-2" />
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
