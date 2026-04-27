import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function generateFormQuestions(prompt: string, imageBase64?: string, imageMime?: string) {
  const contents: any[] = [prompt];
  if (imageBase64 && imageMime) {
    contents.push({
      inlineData: {
        data: imageBase64,
        mimeType: imageMime,
      }
    });
  }

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: contents,
    config: {
      systemInstruction: "You are a feedback form expert. The user wants to create a form. Generate a JSON array of questions based on their prompt and/or image/document. Each question must have 'id' (a short random string), 'type' (can be 'text', 'multiple_choice', 'scale'), 'title' (question string), 'options' (array of strings if multiple_choice, else omit), 'required' (boolean). Return strictly valid JSON array without markdown wrapping.",
      responseMimeType: "application/json",
      temperature: 0.2,
    }
  });

  return JSON.parse(response.text || '[]');
}

export async function organizeFormQuestions(title: string, description: string, questions: any[]) {
  const prompt = `
  You are an expert form designer. The user has a form titled "${title}" with description "${description}".
  Here are the current questions:
  ${JSON.stringify(questions)}

  Your task is to organize and improve these questions.
  1. Fix typos and improve the phrasing of the questions for clarity.
  2. Organize them into logical sections if there are many questions (add 'section_header' type questions).
  3. Ensure required flags make sense.
  4. Ensure options are well-formatted.

  Return a JSON array of the improved questions. Use the same structure format.
  Each question must have 'id', 'type' (can be 'text', 'multiple_choice', 'scale', 'section_header', 'checkboxes', 'dropdown'), 'title', 'options' (array of strings if applicable), 'required' (boolean).
  Return strictly valid JSON array without markdown wrapping.
  `;
  
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      temperature: 0.2,
    }
  });

  return JSON.parse(response.text || '[]');
}
export async function customFormAnalysis(questions: any[], submissions: any[], query: string) {
  const prompt = `
  Here are the questions of the feedback form:
  ${JSON.stringify(questions)}

  Here are the submissions:
  ${JSON.stringify(submissions)}

  The user has a specific question or request regarding these submissions:
  "${query}"

  Please analyze the results to answer the user's specific question.
  Return a clear, formatted markdown response. 
  Answer purely based on the provided submissions data.
  `;
  
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      temperature: 0.2,
    }
  });

  return response.text || "No insights generated.";
}

export async function analyzeFormResults(questions: any[], submissions: any[]) {

  const prompt = `
  Here are the questions of the feedback form:
  ${JSON.stringify(questions)}

  Here are the submissions:
  ${JSON.stringify(submissions)}

  Please analyze these results. Provide an overall summary, and categorize the text feedback into well-organized themes (e.g., positive, needs improvement, feature requests).
  Return a structured JSON object with two fields:
  - 'summary': A markdown formatted string with the overall summary and key takeaways.
  - 'categories': An array of objects, where each object has 'theme' (string) and 'notes' (array of strings).
  Return strictly valid JSON without markdown wrapping.
  `;
  
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      temperature: 0.2,
    }
  });

  return JSON.parse(response.text || '{}');
}
