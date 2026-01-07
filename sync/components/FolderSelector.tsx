import React, { useState } from 'react';
import { FolderInput, FolderOutput, Search } from 'lucide-react';

interface FolderSelectorProps {
  label: string;
  folderId: string;
  onChange: (id: string) => void;
  type: 'source' | 'destination';
  disabled?: boolean;
}

export const FolderSelector: React.FC<FolderSelectorProps> = ({ 
  label, 
  folderId, 
  onChange, 
  type,
  disabled 
}) => {
  // In a real app, this would use the Google Picker API.
  // For this prototype, we'll ask for the ID or allow a simple manual entry.
  
  return (
    <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex-1">
      <div className="flex items-center mb-3 text-slate-800">
        {type === 'source' ? <FolderInput className="w-5 h-5 mr-2 text-blue-600" /> : <FolderOutput className="w-5 h-5 mr-2 text-green-600" />}
        <h3 className="font-semibold">{label}</h3>
      </div>
      
      <div className="relative">
        <input
          type="text"
          value={folderId}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter Google Drive Folder ID"
          disabled={disabled}
          className="w-full pl-10 pr-4 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-400 font-mono"
        />
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-4 w-4 text-slate-400" />
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Copy the ID from the URL of your Drive folder: <code>drive.google.com/drive/folders/<b>ID_IS_HERE</b></code>
      </p>
    </div>
  );
};
