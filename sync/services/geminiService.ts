import { GoogleGenAI, Type, Schema, Tool } from "@google/genai";
import { RECIPE_JSON_SCHEMA_PROMPT, RECIPE_MARKDOWN_TEMPLATE } from '../constants';
import { Recipe, ProcessedRecipe } from '../types';

// Try multiple ways to get the API key
const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY || '';

if (!apiKey) {
  console.warn("⚠️  Gemini API Key is missing. The app will work in Demo Mode, but real processing requires a valid API key.");
  console.warn("💡 To add an API key:");
  console.warn("   1. Get a Gemini API key from: https://makersuite.google.com/app/apikey");
  console.warn("   2. Add it to .env.local as: GEMINI_API_KEY=your_key_here");
  console.warn("   3. Restart the development server");
}

const ai = new GoogleGenAI({ apiKey: apiKey || '' });

// Updated schema to match the new Recipe interface
const recipeSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    source: { type: Type.STRING },
    imageUrl: { type: Type.STRING },
    ingredients: { 
      type: Type.ARRAY, 
      items: { type: Type.STRING } 
    },
    method: { 
      type: Type.ARRAY, 
      items: { type: Type.STRING } 
    },
    prepTime: { type: Type.STRING },
    cookTime: { type: Type.STRING },
    servings: { type: Type.STRING }
  },
  required: ["title", "ingredients", "method"],
};

/**
 * Extracts the og:image URL from a webpage by fetching its HTML
 */
const extractOgImageFromPage = async (pageUrl: string): Promise<string | null> => {
  console.log(`Attempting to extract og:image from: ${pageUrl}`);
  
  const corsProxies = [
    (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  ];
  
  for (const proxyFn of corsProxies) {
    try {
      const proxyUrl = proxyFn(pageUrl);
      const response = await fetch(proxyUrl);
      
      if (response.ok) {
        const html = await response.text();
        
        // Try to find og:image meta tag
        const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
                            html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
        
        if (ogImageMatch && ogImageMatch[1]) {
          console.log(`✓ Found og:image: ${ogImageMatch[1]}`);
          return ogImageMatch[1];
        }
        
        // Fallback: try to find the first large image in the content
        const imgMatches = html.match(/<img[^>]*src=["']([^"']+\.(jpg|jpeg|png|webp)[^"']*)["']/gi);
        if (imgMatches && imgMatches.length > 0) {
          // Get the first image that's not a logo or icon
          for (const imgTag of imgMatches) {
            const srcMatch = imgTag.match(/src=["']([^"']+)["']/i);
            if (srcMatch && srcMatch[1] && 
                !srcMatch[1].includes('logo') && 
                !srcMatch[1].includes('icon') &&
                !srcMatch[1].includes('avatar')) {
              console.log(`✓ Found fallback image: ${srcMatch[1]}`);
              return srcMatch[1];
            }
          }
        }
        
        console.log('No og:image found in page HTML');
        return null;
      }
    } catch (e) {
      console.log(`Failed to fetch page HTML: ${(e as Error).message}`);
    }
  }
  
  return null;
};

/**
 * Fetches an image from a URL and returns it as base64
 * Uses image proxy services that can handle CORS and broken URLs
 */
const fetchImageAsBase64 = async (imageUrl: string): Promise<{ data: string; mimeType: string } | null> => {
  if (!imageUrl || imageUrl.trim() === '') return null;
  
  console.log(`Fetching image from: ${imageUrl}`);
  
  // Image proxy services that can fetch and serve images with CORS headers
  // These services also often have caching and can handle redirects better
  const imageProxies = [
    // wsrv.nl (images.weserv.nl) - very reliable image proxy
    (url: string) => `https://wsrv.nl/?url=${encodeURIComponent(url)}&output=webp&q=85`,
    // imageproxy via statically.io
    (url: string) => `https://cdn.statically.io/img/${url.replace(/^https?:\/\//, '')}`,
    // Direct CORS proxies as fallback
    (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  ];
  
  // Try direct fetch first (for images that allow CORS)
  try {
    const response = await fetch(imageUrl, {
      mode: 'cors',
      headers: { 'Accept': 'image/*' }
    });
    
    if (response.ok) {
      const blob = await response.blob();
      if (blob.size > 1000) { // At least 1KB to be a real image
        console.log('✓ Direct fetch succeeded');
        return await blobToBase64(blob);
      }
    }
  } catch (e) {
    console.log('Direct fetch blocked by CORS, trying image proxies...');
  }
  
  // Try each image proxy
  for (const proxyFn of imageProxies) {
    const proxyUrl = proxyFn(imageUrl);
    try {
      console.log(`Trying proxy: ${proxyUrl.substring(0, 60)}...`);
      const response = await fetch(proxyUrl);
      
      if (response.ok) {
        const blob = await response.blob();
        const contentType = response.headers.get('content-type') || blob.type || '';
        
        // Verify it's actually an image (not HTML error page)
        const isImage = contentType.startsWith('image/') || 
                        contentType.includes('webp') || 
                        contentType.includes('jpeg') ||
                        contentType.includes('png');
        
        // Check if we got actual image data (at least 1KB and correct type)
        if (blob.size > 1000 && isImage) {
          const mimeType = blob.type || 'image/webp';
          console.log(`✓ Proxy fetch succeeded (${mimeType}, ${Math.round(blob.size/1024)}KB)`);
          return await blobToBase64(blob);
        } else if (!isImage) {
          console.log(`Proxy returned non-image content (${contentType})`);
        } else {
          console.log(`Proxy returned small/empty response (${blob.size} bytes)`);
        }
      } else {
        console.log(`Proxy returned ${response.status}`);
      }
    } catch (e) {
      console.log(`Proxy failed: ${(e as Error).message}`);
    }
  }
  
  console.warn('All fetch methods failed for image');
  return null;
};

/**
 * Convert blob to base64
 */
const blobToBase64 = (blob: Blob): Promise<{ data: string; mimeType: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(',')[1];
      resolve({ data: base64, mimeType: blob.type || 'image/jpeg' });
    };
    reader.onerror = () => reject(new Error('Failed to convert blob to base64'));
    reader.readAsDataURL(blob);
  });
};

/**
 * Generates markdown content from a Recipe object using the template
 */
export const generateMarkdown = (recipe: Recipe, imageFileName?: string): string => {
  // Format ingredients as bullet points
  const ingredientsList = recipe.ingredients
    .map(ing => `- ${ing}`)
    .join('\n');
  
  // Format method as numbered steps
  const methodList = recipe.method
    .map((step, index) => `${index + 1}. ${step}`)
    .join('\n');
  
  // Get today's date in YYYY-MM-DD format
  const today = new Date().toISOString().split('T')[0];
  
  // Generate sanitized filename for image
  const sanitizedTitle = recipe.title
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .substring(0, 100);
  
  const imgFileName = imageFileName || `${sanitizedTitle}.webp`;
  
  // Replace template placeholders
  let markdown = RECIPE_MARKDOWN_TEMPLATE
    .replace(/\{\{title\}\}/g, recipe.title)
    .replace('{{source}}', recipe.source || '')
    .replace('{{added}}', today)
    .replace(/\{\{imageFileName\}\}/g, imgFileName)
    .replace('{{ingredients}}', ingredientsList)
    .replace('{{method}}', methodList);
  
  return markdown;
};

/**
 * Parse a recipe from file content using Gemini AI
 * Returns the recipe data, generated markdown, and optionally the image data
 */
export const parseRecipeWithGemini = async (
  fileContent: string, 
  mimeType: string, 
  isBinary: boolean,
  customPrompt?: string
): Promise<ProcessedRecipe> => {
  // Use custom prompt if provided, otherwise use default
  const prompt = customPrompt || RECIPE_JSON_SCHEMA_PROMPT;
  
  // If no API key is provided, return demo data
  if (!apiKey) {
    console.log("🔧 Demo Mode: Returning simulated recipe data");
    const demoRecipe: Recipe = {
      title: `Demo Recipe (${mimeType.includes('image') ? 'Image' : 'Text'})`,
      source: "Demo Mode",
      ingredients: ["2 cups Imagination", "1 tbsp Code", "A pinch of AI magic"],
      method: [
        "Detect file in Drive folder",
        "Extract content (text or image)",
        "Send to Gemini AI for analysis",
        "Parse structured recipe data",
        "Save markdown to destination folder"
      ],
      prepTime: "5m",
      cookTime: "5m", 
      servings: "2"
    };
    
    return {
      recipe: demoRecipe,
      markdown: generateMarkdown(demoRecipe),
      imageData: isBinary ? fileContent : undefined,
      imageMimeType: isBinary ? mimeType : undefined
    };
  }

  try {
    const modelId = 'gemini-2.0-flash';
    let contents: any;
    let tools: Tool[] | undefined = undefined;

    // Check if the content is a URL text file
    // Simple regex for a standalone URL in the file content
    const isUrlText = !isBinary && /^(https?:\/\/[^\s]+)$/i.test(fileContent.trim());

    if (isBinary) {
      // Image or PDF
      contents = {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: fileContent
            }
          },
          {
            text: prompt
          }
        ]
      };
    } else if (isUrlText) {
      // It's a URL (e.g. shared from phone). Use Search Grounding.
      console.log("URL detected in file content. Using Google Search Grounding.");
      const url = fileContent.trim();
      tools = [{ googleSearch: {} }];
      
      contents = {
        parts: [
          {
            text: `The file content provided is a URL to a recipe: ${url}. \n\n Please use Google Search to visit this URL, read the recipe details from the page, and then ${prompt}`
          }
        ]
      };
    } else {
      // Plain text, HTML, or Doc content
      contents = {
        parts: [
          {
            text: `Here is the text content of a file:\n\n${fileContent}\n\n${prompt}`
          }
        ]
      };
    }

    const response = await ai.models.generateContent({
      model: modelId,
      contents: contents,
      config: {
        responseMimeType: "application/json",
        responseSchema: recipeSchema,
        tools: tools, 
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error("No response from Gemini");
    }

    const recipe = JSON.parse(text) as Recipe;
    
    // Determine image data
    let imageData: string | undefined;
    let imageMimeType: string | undefined;
    
    // Keep track of the original page URL for og:image fallback
    const originalPageUrl = isUrlText ? fileContent.trim() : null;
    
    if (isBinary && mimeType.startsWith('image/')) {
      // Source was an image file - use it directly
      imageData = fileContent;
      imageMimeType = mimeType;
    } else if (recipe.imageUrl) {
      // Source was a URL/text - try to fetch the image from the extracted URL
      console.log(`Attempting to fetch recipe image from: ${recipe.imageUrl}`);
      let fetchedImage = await fetchImageAsBase64(recipe.imageUrl);
      
      // If Gemini's URL failed, try og:image fallback
      if (!fetchedImage && originalPageUrl) {
        console.log(`Gemini's image URL failed, trying og:image fallback...`);
        const ogImageUrl = await extractOgImageFromPage(originalPageUrl);
        if (ogImageUrl) {
          console.log(`Trying og:image URL: ${ogImageUrl}`);
          fetchedImage = await fetchImageAsBase64(ogImageUrl);
        }
      }
      
      if (fetchedImage) {
        imageData = fetchedImage.data;
        imageMimeType = fetchedImage.mimeType;
        console.log(`✓ Successfully fetched image (${imageMimeType})`);
      } else {
        console.warn(`Could not fetch image from any source`);
      }
    } else if (originalPageUrl) {
      // No imageUrl from Gemini, try og:image directly
      console.log(`No imageUrl from Gemini, trying og:image extraction...`);
      const ogImageUrl = await extractOgImageFromPage(originalPageUrl);
      if (ogImageUrl) {
        const fetchedImage = await fetchImageAsBase64(ogImageUrl);
        if (fetchedImage) {
          imageData = fetchedImage.data;
          imageMimeType = fetchedImage.mimeType;
          console.log(`✓ Successfully fetched og:image (${imageMimeType})`);
        }
      }
    }
    
    // Generate markdown from the extracted recipe
    const markdown = generateMarkdown(recipe);
    
    // Return the processed recipe with image data
    return {
      recipe,
      markdown,
      imageData,
      imageMimeType
    };

  } catch (error) {
    console.error("Gemini Processing Error:", error);
    throw error;
  }
};
