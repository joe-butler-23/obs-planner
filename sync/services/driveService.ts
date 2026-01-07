import { DriveFile, Recipe, ProcessedRecipe } from '../types';
import { SUPPORTED_MIME_TYPES } from '../constants';

// --- Real Drive API Functions ---

export const waitForGapi = (): Promise<void> => {
  return new Promise((resolve) => {
    if (window.gapi && window.gapi.client) {
      resolve();
    } else {
      const interval = setInterval(() => {
        if (window.gapi && window.gapi.client) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
    }
  });
};

/**
 * Gets the starting token for monitoring changes.
 * This marks "now" in the history.
 */
export const getStartPageToken = async (): Promise<string> => {
  const response = await window.gapi.client.drive.changes.getStartPageToken({});
  return response.result.startPageToken;
};

/**
 * Checks for changes since the specific token.
 * We act like a webhook receiver here: we only care about *new* files added to our specific folder.
 */
export const getFolderChanges = async (pageToken: string, folderId: string): Promise<{ newFiles: DriveFile[], nextToken: string }> => {
  const response = await window.gapi.client.drive.changes.list({
    pageToken: pageToken,
    fields: 'newStartPageToken, nextPageToken, changes(file(id, name, mimeType, parents, trashed))',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    pageSize: 100
  });

  const changes = response.result.changes || [];
  const newFiles: DriveFile[] = [];

  for (const change of changes) {
    const file = change.file;
    // We only care if:
    // 1. It is not trashed
    // 2. It exists (file object is present)
    // 3. It is IN the source folder we are watching
    if (file && !file.trashed && file.parents && file.parents.includes(folderId)) {
        newFiles.push({
            id: file.id,
            name: file.name,
            mimeType: file.mimeType
        });
    }
  }

  return {
    newFiles,
    nextToken: response.result.newStartPageToken || response.result.nextPageToken
  };
};

export const listFiles = async (folderId: string): Promise<DriveFile[]> => {
  const response = await window.gapi.client.drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType, webViewLink)',
    pageSize: 100,
  });
  return response.result.files || [];
};

export const getFileContent = async (file: DriveFile): Promise<{ content: string; isBinary: boolean; mimeType: string }> => {
  const { id, mimeType } = file;

  if (mimeType === 'application/vnd.google-apps.document') {
    const response = await window.gapi.client.drive.files.export({
      fileId: id,
      mimeType: 'text/plain',
    });
    return { content: response.body, isBinary: false, mimeType: 'text/plain' };
  } else if (mimeType.startsWith('text/') || mimeType === 'application/json') {
     const response = await window.gapi.client.drive.files.get({
      fileId: id,
      alt: 'media',
    });
    return { content: response.body, isBinary: false, mimeType: mimeType };
  } else {
    const accessToken = window.gapi.client.getToken().access_token;
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });
    const blob = await response.blob();
    const base64 = await blobToBase64(blob);
    return { content: base64, isBinary: true, mimeType: mimeType };
  }
};

/**
 * Creates a folder in Google Drive
 */
const createFolder = async (name: string, parentId: string): Promise<string> => {
  const accessToken = window.gapi.client.getToken().access_token;
  
  const metadata = {
    name: name,
    mimeType: 'application/vnd.google-apps.folder',
    parents: [parentId]
  };

  const response = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(metadata)
  });

  if (!response.ok) {
    throw new Error(`Failed to create folder: ${response.statusText}`);
  }

  const result = await response.json();
  return result.id;
};

/**
 * Uploads a file to Google Drive
 */
const uploadFile = async (
  fileName: string, 
  content: string | Blob, 
  mimeType: string, 
  parentId: string
): Promise<DriveFile> => {
  const accessToken = window.gapi.client.getToken().access_token;
  
  const metadata = {
    name: fileName,
    parents: [parentId],
    mimeType: mimeType,
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  
  if (content instanceof Blob) {
    form.append('file', content);
  } else {
    form.append('file', new Blob([content], { type: mimeType }));
  }

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
    body: form,
  });

  if (!response.ok) {
    throw new Error(`Failed to upload file: ${response.statusText}`);
  }

  const result = await response.json();
  return { id: result.id, name: result.name, mimeType: result.mimeType };
};

/**
 * Converts base64 to Blob
 */
const base64ToBlob = (base64: string, mimeType: string): Blob => {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
};

/**
 * Gets or creates a subfolder within a parent folder
 */
const getOrCreateSubfolder = async (name: string, parentId: string): Promise<string> => {
  const accessToken = window.gapi.client.getToken().access_token;
  
  // First, check if folder already exists
  const searchResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id)`,
    {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    }
  );
  
  const searchResult = await searchResponse.json();
  if (searchResult.files && searchResult.files.length > 0) {
    return searchResult.files[0].id;
  }
  
  // Folder doesn't exist, create it
  return await createFolder(name, parentId);
};

/**
 * Saves a processed recipe with markdown file and optional image
 * Structure: 
 *   - sorted/recipe-name.md (markdown file)
 *   - sorted/images/recipe-name.webp (image)
 *   - sorted/processed/ (where originals go after processing)
 */
export const saveProcessedRecipe = async (
  folderId: string, 
  processedRecipe: ProcessedRecipe
): Promise<DriveFile> => {
  const { recipe, markdown, imageData, imageMimeType } = processedRecipe;
  
  // Sanitize the recipe title for use as file name
  const sanitizedTitle = recipe.title
    .replace(/[<>:"/\\|?*]/g, '') // Remove invalid filename characters
    .replace(/\s+/g, '-')         // Replace spaces with dashes
    .toLowerCase()                 // Convert to lowercase for filename
    .substring(0, 100);           // Limit length
  
  // Generate the image filename based on recipe name
  const imageFileName = `${sanitizedTitle}.webp`;
  
  // Get or create images subfolder in destination
  const imagesFolderId = await getOrCreateSubfolder('images', folderId);
  
  // Save image if available to images/ folder
  if (imageData && imageMimeType) {
    const imageBlob = base64ToBlob(imageData, imageMimeType);
    await uploadFile(imageFileName, imageBlob, 'image/webp', imagesFolderId);
  }
  
  // Save markdown file directly in destination folder
  const mdFile = await uploadFile(
    `${sanitizedTitle}.md`, 
    markdown, 
    'text/markdown', 
    folderId
  );
  
  return mdFile;
};

/**
 * Gets the 'processed' subfolder ID (creates if doesn't exist)
 */
export const getProcessedFolderId = async (parentFolderId: string): Promise<string> => {
  return await getOrCreateSubfolder('processed', parentFolderId);
};

// Legacy function for backwards compatibility
export const saveRecipe = async (folderId: string, originalFileName: string, recipe: Recipe): Promise<DriveFile> => {
  const fileName = `[Processed] ${originalFileName.split('.')[0]}.json`;
  const content = JSON.stringify(recipe, null, 2);
  
  const metadata = {
    name: fileName,
    parents: [folderId],
    mimeType: 'application/json',
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([content], { type: 'application/json' }));

  const accessToken = window.gapi.client.getToken().access_token;
  
  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
    body: form,
  });

  if (!response.ok) {
    throw new Error(`Failed to upload file: ${response.statusText}`);
  }

  const result = await response.json();
  return { id: result.id, name: result.name, mimeType: result.mimeType };
};

/**
 * Moves a file to a different folder (for archiving processed files)
 */
export const moveFile = async (fileId: string, destinationFolderId: string): Promise<void> => {
  try {
    // Get the file's current parents
    const fileResponse = await window.gapi.client.drive.files.get({
      fileId: fileId,
      fields: 'parents'
    });
    
    const previousParents = fileResponse.result.parents?.join(',');
    
    // Move the file to the new folder
    await window.gapi.client.drive.files.update({
      fileId: fileId,
      addParents: destinationFolderId,
      removeParents: previousParents,
      fields: 'id, parents'
    });
  } catch (error) {
    console.error("Error moving file:", error);
    throw error;
  }
};

/**
 * Checks if a markdown file with a similar name already exists in the destination folder
 */
export const checkFileExists = async (folderId: string, namePartial: string): Promise<boolean> => {
    // Check for markdown files that match the recipe name pattern
    const baseName = namePartial.split('.')[0]
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, '-')
      .toLowerCase();
    
    // Escape single quotes and remove other special characters that break queries
    // Also remove characters that could interfere with Drive API query syntax
    const sanitizedBaseName = baseName
      .replace(/[&'`]/g, '')  // Remove ampersands, quotes, and backticks
      .replace(/[^\w\s-]/g, '') // Remove any remaining special chars except word chars, spaces, dashes
      .replace(/\s+/g, '-')     // Replace any spaces with dashes
      .replace(/-+/g, '-')      // Replace multiple dashes with single dash
      .trim();
    
    // If sanitization removed everything, return false
    if (!sanitizedBaseName || sanitizedBaseName.length < 2) {
      return false;
    }
    
    const response = await window.gapi.client.drive.files.list({
        q: `'${folderId}' in parents and name contains '${sanitizedBaseName}' and mimeType='text/markdown' and trashed = false`,
        fields: 'files(id, name)',
        pageSize: 10
    });
    
    // Check if any file matches our naming pattern
    if (response.result.files && response.result.files.length > 0) {
      return response.result.files.some((f: any) => f.name.endsWith('.md'));
    }
    return false;
}

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

// --- Mock Data & Functions for Demo Mode ---

const MOCK_FILES = [
  {
    id: 'demo-file-1',
    name: 'Grandmas_Apple_Pie_Scan.txt',
    mimeType: 'text/plain',
    content: `RECIPE: OLD FASHIONED APPLE PIE\nIngredients: apples, sugar, crust.\nSteps: Bake it.`
  },
  {
    id: 'demo-file-2',
    name: 'Spicy_Tacos_Note.txt',
    mimeType: 'text/plain',
    content: `Tacos\nBeef, shells, cheese.\nCook meat, serve.`
  }
];

// Pre-scheduled demo files
const MOCK_INCOMING_FILES = [
  {
    id: 'demo-file-3',
    name: 'Chocolate_Cake_Photo.txt', 
    mimeType: 'text/plain',
    content: `Chocolate Cake\nFlour, Cocoa, Eggs, Sugar.\nMix and bake at 350.`
  }
];

const processedDemoFiles = new Set<string>();
let demoStartTime = 0;
let demoTokenCounter = 0;

// Dynamic simulated files (added via UI)
interface MockFileContent {
    file: DriveFile;
    content: string;
    isBinary: boolean;
}
let dynamicMockQueue: MockFileContent[] = [];
let releasedDynamicFiles: DriveFile[] = [];

// Allow the UI to inject a file "into Drive"
export const injectMockFile = (name: string, mimeType: string, content: string, isBinary: boolean = false) => {
    const newFile: DriveFile = {
        id: `demo-dynamic-${Date.now()}`,
        name,
        mimeType
    };
    dynamicMockQueue.push({ file: newFile, content, isBinary });
    console.log("DEMO: Injected file into mock drive queue", name);
};

export const mockGetStartPageToken = async (): Promise<string> => {
    demoStartTime = Date.now();
    demoTokenCounter = 0;
    // Reset queues on fresh start
    releasedDynamicFiles = [];
    return "demo-token-0";
};

export const mockGetFolderChanges = async (pageToken: string, folderId: string): Promise<{ newFiles: DriveFile[], nextToken: string }> => {
    // Simulate network latency
    await new Promise(resolve => setTimeout(resolve, 500)); 
    
    const now = Date.now();
    const elapsed = now - demoStartTime;
    const newFiles: DriveFile[] = [];

    // 1. Process Automatic files (Time-based)
    if (elapsed > 3000 && demoTokenCounter === 0) {
        newFiles.push(MOCK_INCOMING_FILES[0]);
        demoTokenCounter++;
    }

    // 2. Process Dynamic files (User injected)
    // We move them from the "queue" to "released" so they appear in changes
    if (dynamicMockQueue.length > 0) {
        const nextBatch = dynamicMockQueue.splice(0, dynamicMockQueue.length);
        nextBatch.forEach(item => {
            newFiles.push(item.file);
            releasedDynamicFiles.push(item.file);
            // We also need to store the content lookup for later
            // (We'll store it in a way mockGetFileContent can find it)
            (window as any).__DEMO_CONTENT_STORE = (window as any).__DEMO_CONTENT_STORE || {};
            (window as any).__DEMO_CONTENT_STORE[item.file.id] = { 
                content: item.content, 
                isBinary: item.isBinary,
                mimeType: item.file.mimeType 
            };
        });
    }

    // Always increment token to simulate moving forward
    const nextToken = `demo-token-${Date.now()}`;

    return {
        newFiles,
        nextToken
    };
};

export const mockListFiles = async (folderId: string): Promise<DriveFile[]> => {
  await new Promise(resolve => setTimeout(resolve, 800));
  return [...MOCK_FILES, ...releasedDynamicFiles].map(f => ({ id: f.id, name: f.name, mimeType: f.mimeType }));
};

export const mockGetFileContent = async (file: DriveFile): Promise<{ content: string; isBinary: boolean; mimeType: string }> => {
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Check dynamic store first
  const dynamicStore = (window as any).__DEMO_CONTENT_STORE || {};
  if (dynamicStore[file.id]) {
      return dynamicStore[file.id];
  }

  // Check static mocks
  const allMock = [...MOCK_FILES, ...MOCK_INCOMING_FILES];
  const mockFile = allMock.find(f => f.id === file.id);
  
  return { 
    content: mockFile?.content || '', 
    isBinary: false, 
    mimeType: 'text/plain' 
  };
};

export const mockSaveRecipe = async (folderId: string, originalFileName: string, recipe: Recipe): Promise<DriveFile> => {
  await new Promise(resolve => setTimeout(resolve, 1500));
  console.log("DEMO MODE: Saved recipe", recipe);
  processedDemoFiles.add(originalFileName);
  return { id: 'new-demo-id', name: `[Processed] ${originalFileName}`, mimeType: 'application/json' };
};

export const mockCheckFileExists = async (folderId: string, namePartial: string): Promise<boolean> => {
  const allMock = [...MOCK_FILES, ...MOCK_INCOMING_FILES, ...releasedDynamicFiles];
  const originalName = allMock.find(f => f.name.includes(namePartial.split('.')[0]))?.name;
  if (!originalName) return false;
  return processedDemoFiles.has(originalName);
};
