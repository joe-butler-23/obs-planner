export const DISCOVERY_DOCS = ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'];
export const SCOPES = 'https://www.googleapis.com/auth/drive'; // Broad access needed to read/write user selected folders

export const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
  'text/html', // Saved webpages
  'application/vnd.google-apps.document', // Google Docs
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document' // DOCX
];

export const RECIPE_JSON_SCHEMA_PROMPT = `
  Extract the recipe from the provided file. 
  Return the output strictly as a JSON object with the following schema:
  {
    "title": "string (the recipe name)",
    "source": "string (original source URL, website name, or cookbook name if identifiable)",
    "imageUrl": "string (IMPORTANT: the URL of the main hero/featured recipe photo - must be a full valid URL to an actual image file ending in .jpg, .jpeg, .png, or .webp. Look for the largest, most prominent food photo on the page, typically in the hero section or at the top of the recipe.)",
    "ingredients": ["string", "string"],
    "method": ["string", "string (numbered steps for cooking)"],
    "prepTime": "string (optional)",
    "cookTime": "string (optional)",
    "servings": "string (optional)"
  }
  
  Important notes:
  - Use "method" for cooking steps, not "instructions"
  - Ingredients should be formatted as "quantity unit ingredient" (e.g., "2 cups flour")
  - Method steps should be clear and numbered in the array
  - For imageUrl: Find the CURRENT main recipe image URL from the page's HTML. Look for <img> tags with src attributes containing the recipe photo, or og:image meta tags. The URL should be complete and currently valid.
  - If information is missing, use empty strings or empty arrays
  - Do not add markdown formatting like \`\`\`json
`;

export const RECIPE_MARKDOWN_TEMPLATE = `---
title: {{title}}
type: recipe
source: {{source}}
added: {{added}}
cover: images/{{imageFileName}}
cooked: false
marked: false
scheduled: null
---
# {{title}}

![Recipe Image](images/{{imageFileName}})

## Ingredients

{{ingredients}}

## Method

{{method}}
`;
