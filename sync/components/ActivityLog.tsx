import React from 'react';
import { ProcessingLog, FileStatus } from '../types';
import { FileText, CheckCircle, AlertCircle, Loader2, SkipForward } from 'lucide-react';

interface ActivityLogProps {
  logs: ProcessingLog[];
}

export const ActivityLog: React.FC<ActivityLogProps> = ({ logs }) => {
  if (logs.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400 bg-white rounded-lg border border-slate-200 shadow-sm">
        <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
        <p>No activity yet. Start monitoring to process files.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
        <h3 className="font-semibold text-slate-700">Activity Log</h3>
        <span className="text-xs text-slate-500">{logs.length} events</span>
      </div>
      <div className="max-h-[400px] overflow-y-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-slate-500 uppercase bg-slate-50 sticky top-0">
            <tr>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">File</th>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Message</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs.map((log) => (
              <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 whitespace-nowrap">
                  <StatusBadge status={log.status} />
                </td>
                <td className="px-4 py-3 font-medium text-slate-700">{log.fileName}</td>
                <td className="px-4 py-3 text-slate-500">
                  {log.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </td>
                <td className="px-4 py-3 text-slate-600 max-w-xs truncate">
                  {log.message || '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const StatusBadge: React.FC<{ status: FileStatus }> = ({ status }) => {
  switch (status) {
    case FileStatus.COMPLETED:
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
          <CheckCircle className="w-3 h-3 mr-1" /> Done
        </span>
      );
    case FileStatus.PROCESSING:
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 animate-pulse">
          <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Working
        </span>
      );
    case FileStatus.ERROR:
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
          <AlertCircle className="w-3 h-3 mr-1" /> Error
        </span>
      );
    case FileStatus.SKIPPED:
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
          <SkipForward className="w-3 h-3 mr-1" /> Skipped
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
          Pending
        </span>
      );
  }
};
