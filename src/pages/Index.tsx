"use client";

import { useState, useEffect, useMemo } from "react";
import { Upload, FileDown, FileUp, Plus, Search, X, Edit2, Trash2, Save, Database, Server, Globe, Network, ArrowDownAZ, Folder, FolderOpen, Settings } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { showSuccess, showError } from "@/utils/toast";

const APP_VERSION = "1.0.0";

interface TnsEntry {
  id: string;
  alias: string;
  host: string;
  port: string;
  serviceName: string;
  protocol: string;
  description: string;
  group?: string;
}

const generateId = () => Math.random().toString(36).substr(2, 9);

// Parse tnsnames.ora content - robust version with group support
function parseTnsnames(content: string): { entries: TnsEntry[]; groups: string[] } {
  const entries: TnsEntry[] = [];
  const groups: string[] = [];
  
  // Split into lines
  const lines = content.split('\n');
  
  // First pass: find all group comments and their line positions
  const groupPositions: { line: number; group: string }[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Skip empty lines
    if (!line) continue;
    
    // Check for group comments (but not other comments)
    if (line.startsWith('#')) {
      const comment = line.substring(1).trim();
      if (comment.toUpperCase().startsWith('GROUP:')) {
        const groupName = comment.substring(6).trim();
        if (groupName && !groups.includes(groupName)) {
          groups.push(groupName);
        }
        groupPositions.push({ line: i, group: groupName });
      }
      // Skip other comments (non-group comments)
      continue;
    }
    
    // Skip lines that don't look like alias definitions
    if (!line.includes('=')) continue;
  }
  
  // Second pass: find all alias = entries
  const aliasPositions: { line: number; alias: string }[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines
    if (!line) continue;
    
    // Skip comments
    if (line.startsWith('#')) continue;
    
    // Match alias = or alias = ( pattern
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(\()?$/);
    if (match) {
      aliasPositions.push({ line: i, alias: match[1] });
    }
  }
  
  // For each entry, find the most recent group comment before it
  for (const aliasPos of aliasPositions) {
    // Find the most recent group comment before this entry
    let entryGroup: string | undefined;
    for (let i = groupPositions.length - 1; i >= 0; i--) {
      if (groupPositions[i].line < aliasPos.line) {
        entryGroup = groupPositions[i].group;
        break;
      }
    }
    
    // Extract the entry content (from alias line to matching closing parenthesis)
    let braceLevel = 0;
    let entryStartLine = aliasPos.line;
    let entryEndLine = aliasPos.line;
    let foundOpenParen = false;
    
    for (let i = aliasPos.line; i < lines.length; i++) {
      const line = lines[i];
      for (const char of line) {
        if (char === '(') {
          braceLevel++;
          foundOpenParen = true;
        }
        if (char === ')') braceLevel--;
      }
      entryEndLine = i;
      if (foundOpenParen && braceLevel === 0) break;
    }
    
    // Join entry lines
    const entryLines = lines.slice(entryStartLine, entryEndLine + 1).join(' ');
    
    // Extract values from entry content
    const entry: Partial<TnsEntry> = {
      id: generateId(),
      alias: aliasPos.alias,
      host: '',
      port: '1521',
      serviceName: '',
      protocol: 'TCP',
      description: aliasPos.alias,
      group: entryGroup
    };
    
    // Helper function to extract value by key
    function extractValue(key: string): string | null {
      const keyUpper = key.toUpperCase();
      const regex = new RegExp(`\\b${keyUpper}\\s*=\\s*([A-Za-z0-9._-]+)`, 'i');
      const match = entryLines.match(regex);
      return match ? match[1] : null;
    }
    
    const hostValue = extractValue('HOST');
    if (hostValue) entry.host = hostValue;
    
    const portValue = extractValue('PORT');
    if (portValue) entry.port = portValue;
    
    const protocolValue = extractValue('PROTOCOL');
    if (protocolValue) entry.protocol = protocolValue.toUpperCase();
    
    const serviceNameValue = extractValue('SERVICE_NAME') || extractValue('SID');
    if (serviceNameValue) entry.serviceName = serviceNameValue;
    
    if (entry.host && entry.serviceName) {
      entries.push(entry as TnsEntry);
    }
  }
  
  return { entries, groups };
}

// Generate tnsnames.ora content from entries
function generateTnsnames(entries: TnsEntry[]): string {
  let content = '# tnsnames.ora Network Configuration\n';
  content += `# Generated by TNS Names Manager\n`;
  content += `# ${new Date().toISOString()}\n\n`;

  let currentGroup: string | undefined;
  
  entries.forEach((entry, index) => {
    // Add group comment if group changed
    if (entry.group !== currentGroup) {
      if (entry.group) {
        content += `\n# GROUP: ${entry.group}\n`;
      }
      currentGroup = entry.group;
    }
    
    if (index > 0 || entry.group) {
      content += '\n';
    }
    content += `${entry.alias} =\n`;
    content += `  (DESCRIPTION =\n`;
    content += `    (ADDRESS = (PROTOCOL = ${entry.protocol || 'TCP'})(HOST = ${entry.host})(PORT = ${entry.port || '1521'}))\n`;
    content += `    (CONNECT_DATA =\n`;
    content += `      (SERVICE_NAME = ${entry.serviceName})\n`;
    content += `    )\n`;
    content += `  )\n`;
  });

  return content;
}

// Validate entry
function validateEntry(entry: Partial<TnsEntry>): string[] {
  const errors: string[] = [];
  
  if (!entry.alias || entry.alias.trim() === '') {
    errors.push('Alias is required');
  }
  if (!entry.host || entry.host.trim() === '') {
    errors.push('Host is required');
  }
  if (!entry.port || entry.port.trim() === '') {
    errors.push('Port is required');
  } else if (isNaN(parseInt(entry.port)) || parseInt(entry.port) < 1 || parseInt(entry.port) > 65535) {
    errors.push('Port must be 1-65535');
  }
  if (!entry.serviceName || entry.serviceName.trim() === '') {
    errors.push('Service name is required');
  }
  
  return errors;
}

// Sort entries alphabetically by alias
function sortEntries(entries: TnsEntry[]): TnsEntry[] {
  return [...entries].sort((a, b) => 
    a.alias.toLowerCase().localeCompare(b.alias.toLowerCase())
  );
}

// Group entries by custom group
function groupEntries(entries: TnsEntry[]): Map<string, TnsEntry[]> {
  const groups = new Map<string, TnsEntry[]>();
  
  // Add ungrouped entries first
  const ungrouped = entries.filter(e => !e.group || e.group.trim() === '');
  if (ungrouped.length > 0) {
    groups.set('Ungrouped', ungrouped);
  }
  
  // Add grouped entries
  entries.forEach(entry => {
    if (entry.group && entry.group.trim() !== '') {
      if (!groups.has(entry.group)) {
        groups.set(entry.group, []);
      }
      groups.get(entry.group)!.push(entry);
    }
  });
  
  return groups;
}

// Group Management Dialog Component
interface GroupManagementDialogProps {
  groups: string[];
  entries: TnsEntry[];
  onAddGroup: (name: string) => void;
  onDeleteGroup: (name: string) => void;
  onRenameGroup: (oldName: string, newName: string) => void;
}

const GroupManagementDialog = ({ groups, entries, onAddGroup, onDeleteGroup, onRenameGroup }: GroupManagementDialogProps) => {
  const [newGroupName, setNewGroupName] = useState("");
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const handleAddGroup = () => {
    if (newGroupName.trim() && !groups.includes(newGroupName.trim())) {
      onAddGroup(newGroupName.trim());
      setNewGroupName("");
    }
  };

  const handleStartEdit = (group: string) => {
    setEditingGroup(group);
    setEditName(group);
  };

  const handleSaveEdit = () => {
    if (editingGroup && editName.trim() && editName !== editingGroup) {
      onRenameGroup(editingGroup, editName.trim());
    }
    setEditingGroup(null);
    setEditName("");
  };

  const getEntryCount = (group: string) => {
    return entries.filter(e => e.group === group).length;
  };

  return (
    <DialogContent className="sm:max-w-[500px]">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Folder className="w-5 h-5" />
          Manage Groups
        </DialogTitle>
        <DialogDescription>
          Create, rename, or delete groups. Entries can be assigned to groups when editing.
        </DialogDescription>
      </DialogHeader>
      
      <div className="space-y-4">
        {/* Add new group */}
        <div className="flex gap-2">
          <Input
            placeholder="New group name"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddGroup()}
          />
          <Button onClick={handleAddGroup} disabled={!newGroupName.trim()}>
            Add
          </Button>
        </div>

        {/* Group list */}
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {groups.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-4">No groups yet. Create one above.</p>
          ) : (
            groups.map(group => (
              <div key={group} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                {editingGroup === group ? (
                  <>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
                      className="flex-1"
                      autoFocus
                    />
                    <Button size="sm" onClick={handleSaveEdit}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingGroup(null)}>Cancel</Button>
                  </>
                ) : (
                  <>
                    <Folder className="w-4 h-4 text-indigo-500" />
                    <span className="flex-1 font-medium">{group}</span>
                    <span className="text-xs text-slate-400">({getEntryCount(group)} entries)</span>
                    <Button size="sm" variant="ghost" onClick={() => handleStartEdit(group)}>
                      <Edit2 className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onDeleteGroup(group)}>
                      <Trash2 className="w-3 h-3 text-red-500" />
                    </Button>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </DialogContent>
  );
};

const Index = () => {
  const [entries, setEntries] = useState<TnsEntry[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TnsEntry | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false);
  const [rawContent, setRawContent] = useState("");
  const [activeTab, setActiveTab] = useState("entries");
  const [sortBy, setSortBy] = useState<"none" | "alpha">("none");

  // Get entries ready for display/export with sorting applied
  const processedEntries = useMemo(() => {
    let result = [...entries];
    if (sortBy === "alpha") {
      result = sortEntries(result);
    }
    return result;
  }, [entries, sortBy]);

  // Filter entries based on search
  const filteredEntries = useMemo(() => {
    return processedEntries.filter(entry =>
      entry.alias.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.host.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.serviceName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (entry.group && entry.group.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [processedEntries, searchQuery]);

  // Grouped entries for display - always group when there are groups defined
  const groupedEntries = useMemo(() => {
    // Only group if there are groups defined
    if (groups.length === 0) {
      return null;
    }
    return groupEntries(filteredEntries);
  }, [filteredEntries, groups]);

  // Handle file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    
    try {
      const content = await file.text();
      const { entries: parsedEntries, groups: parsedGroups } = parseTnsnames(content);
      
      if (parsedEntries.length === 0) {
        showError("No valid entries found in the file. Please check the format.");
        return;
      }

      const mappedEntries = parsedEntries.map((entry) => ({
        ...entry,
        id: generateId(),
      }));
      
      setEntries(mappedEntries);
      setGroups(parsedGroups);
      showSuccess(`Loaded ${mappedEntries.length} entries from ${file.name}`);
    } catch (error) {
      showError("Failed to parse file. Please ensure it's a valid tnsnames.ora file.");
    } finally {
      setIsLoading(false);
      event.target.value = '';
    }
  };

  // Handle raw content paste
  const handleParseContent = () => {
    if (!rawContent.trim()) {
      showError("Please paste tnsnames.ora content first");
      return;
    }

    setIsLoading(true);
    try {
      const { entries: parsedEntries, groups: parsedGroups } = parseTnsnames(rawContent);
      
      if (parsedEntries.length === 0) {
        showError("No valid entries found. Please check the format.");
        setIsLoading(false);
        return;
      }

      const mappedEntries = parsedEntries.map((entry) => ({
        ...entry,
        id: generateId(),
      }));
      
      setEntries(mappedEntries);
      setGroups(parsedGroups);
      showSuccess(`Parsed ${mappedEntries.length} entries`);
      setActiveTab("entries");
    } catch (error) {
      showError("Failed to parse content. Please check the format.");
    } finally {
      setIsLoading(false);
    }
  };

  // Add new entry
  const handleAddEntry = (newEntry: Omit<TnsEntry, "id">) => {
    const duplicate = entries.find(e => e.alias.toLowerCase() === newEntry.alias.toLowerCase());
    if (duplicate) {
      showError(`Alias "${newEntry.alias}" already exists`);
      return;
    }

    const errors = validateEntry(newEntry);
    if (errors.length > 0) {
      showError(errors[0]);
      return;
    }

    const entry: TnsEntry = {
      ...newEntry,
      id: generateId(),
    };
    
    setEntries([...entries, entry]);
    setIsAddDialogOpen(false);
    showSuccess(`Added entry "${entry.alias}"`);
  };

  // Update entry
  const handleUpdateEntry = (updatedEntry: TnsEntry) => {
    const duplicate = entries.find(e => e.alias.toLowerCase() === updatedEntry.alias.toLowerCase() && e.id !== updatedEntry.id);
    if (duplicate) {
      showError(`Alias "${updatedEntry.alias}" already exists`);
      return;
    }

    const errors = validateEntry(updatedEntry);
    if (errors.length > 0) {
      showError(errors[0]);
      return;
    }

    setEntries(entries.map(e => e.id === updatedEntry.id ? updatedEntry : e));
    setIsEditDialogOpen(false);
    setEditingEntry(null);
    showSuccess(`Updated entry "${updatedEntry.alias}"`);
  };

  // Delete entry
  const handleDeleteEntry = (id: string) => {
    const entry = entries.find(e => e.id === id);
    setEntries(entries.filter(e => e.id !== id));
    showSuccess(`Deleted entry "${entry?.alias}"`);
  };

  // Add new group
  const handleAddGroup = (name: string) => {
    if (!groups.includes(name)) {
      setGroups([...groups, name]);
      showSuccess(`Created group "${name}"`);
    }
  };

  // Delete group
  const handleDeleteGroup = (name: string) => {
    // Remove group from all entries
    const updatedEntries = entries.map(e => 
      e.group === name ? { ...e, group: "" } : e
    );
    setEntries(updatedEntries);
    setGroups(groups.filter(g => g !== name));
    showSuccess(`Deleted group "${name}"`);
  };

  // Rename group
  const handleRenameGroup = (oldName: string, newName: string) => {
    // Update group in all entries
    const updatedEntries = entries.map(e => 
      e.group === oldName ? { ...e, group: newName } : e
    );
    setEntries(updatedEntries);
    setGroups(groups.map(g => g === oldName ? newName : g));
    showSuccess(`Renamed group to "${newName}"`);
  };

  // Export as tnsnames.ora
  const handleExportTnsnames = () => {
    if (entries.length === 0) {
      showError("No entries to export");
      return;
    }

    // Validate all entries first
    const allErrors: { alias: string; errors: string[] }[] = [];
    processedEntries.forEach((entry) => {
      const errors = validateEntry(entry);
      if (errors.length > 0) {
        allErrors.push({ alias: entry.alias, errors });
      }
    });

    if (allErrors.length > 0) {
      showError(`Validation failed: ${allErrors[0].errors[0]} in "${allErrors[0].alias}"`);
      return;
    }

    const content = generateTnsnames(processedEntries);
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tnsnames.ora";
    a.click();
    URL.revokeObjectURL(url);
    showSuccess("Exported tnsnames.ora successfully");
  };

  // Export as JSON
  const handleExportJson = () => {
    if (entries.length === 0) {
      showError("No entries to export");
      return;
    }

    const json = JSON.stringify(processedEntries, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tnsnames.json";
    a.click();
    URL.revokeObjectURL(url);
    showSuccess("Exported JSON successfully");
  };

  // Export as YAML
  const handleExportYaml = () => {
    if (entries.length === 0) {
      showError("No entries to export");
      return;
    }

    const yaml = processedEntries.map(entry => 
      `${entry.alias}:\n  host: ${entry.host}\n  port: ${entry.port}\n  service_name: ${entry.serviceName}\n  protocol: ${entry.protocol || 'TCP'}${entry.group ? `\n  group: ${entry.group}` : ''}`
    ).join('\n\n');

    const blob = new Blob([yaml], { type: "text/yaml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tnsnames.yaml";
    a.click();
    URL.revokeObjectURL(url);
    showSuccess("Exported YAML successfully");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl flex items-center justify-center shadow-lg">
                <Database className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">TNS Names Manager</h1>
                <p className="text-xs text-slate-500">Oracle Database Connection Manager</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                {entries.length} {entries.length === 1 ? 'Entry' : 'Entries'}
              </Badge>
              <span className="text-xs text-slate-400">v{APP_VERSION}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3 mb-6">
          <div className="relative">
            <input
              type="file"
              accept=".ora,.txt"
              onChange={handleFileUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={isLoading}
            />
            <Button variant="outline" disabled={isLoading} className="gap-2">
              <Upload className="w-4 h-4" />
              Upload File
            </Button>
          </div>
          
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4" />
                Add Entry
              </Button>
            </DialogTrigger>
            <EntryFormDialog
              title="Add New Connection"
              groups={groups}
              onSubmit={handleAddEntry}
            />
          </Dialog>

          {/* Manage Groups Button */}
          <Dialog open={isGroupDialogOpen} onOpenChange={setIsGroupDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Folder className="w-4 h-4" />
                Groups ({groups.length})
              </Button>
            </DialogTrigger>
            <GroupManagementDialog
              groups={groups}
              entries={entries}
              onAddGroup={handleAddGroup}
              onDeleteGroup={handleDeleteGroup}
              onRenameGroup={handleRenameGroup}
            />
          </Dialog>

          <div className="flex-1" />

          {/* Sort Control */}
          <div className="flex items-center gap-2">
            <Select value={sortBy} onValueChange={(value: "none" | "alpha") => setSortBy(value)}>
              <SelectTrigger className="w-[140px] bg-white">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  <div className="flex items-center gap-2">
                    <span>No Sort</span>
                  </div>
                </SelectItem>
                <SelectItem value="alpha">
                  <div className="flex items-center gap-2">
                    <ArrowDownAZ className="w-4 h-4" />
                    <span>A-Z</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button variant="outline" onClick={handleExportJson} disabled={entries.length === 0} className="gap-2">
            <FileDown className="w-4 h-4" />
            JSON
          </Button>
          <Button variant="outline" onClick={handleExportYaml} disabled={entries.length === 0} className="gap-2">
            <FileDown className="w-4 h-4" />
            YAML
          </Button>
          <Button onClick={handleExportTnsnames} disabled={entries.length === 0} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
            <Save className="w-4 h-4" />
            Export .ora
          </Button>
        </div>

        {/* Main Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-4 bg-white border shadow-sm">
            <TabsTrigger value="entries" className="gap-2">
              <Database className="w-4 h-4" />
              Connections
            </TabsTrigger>
            <TabsTrigger value="raw" className="gap-2">
              <FileUp className="w-4 h-4" />
              Paste Content
            </TabsTrigger>
          </TabsList>

          <TabsContent value="entries">
            {entries.length === 0 ? (
              <Card className="border-dashed border-2 border-slate-300">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                    <Database className="w-8 h-8 text-slate-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-700 mb-2">No Connections Yet</h3>
                  <p className="text-slate-500 text-center max-w-md mb-4">
                    Upload a tnsnames.ora file or paste its content to get started. 
                    You can also add connections manually.
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setActiveTab("raw")}>
                      Paste Content
                    </Button>
                    <Button onClick={() => setIsAddDialogOpen(true)} className="gap-2">
                      <Plus className="w-4 h-4" />
                      Add Entry
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Search Bar */}
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Search by alias, host, service name, or group..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 bg-white"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Results count */}
                {searchQuery && (
                  <p className="text-sm text-slate-500 mb-4">
                    Found {filteredEntries.length} of {entries.length} entries
                  </p>
                )}

                {/* Entries Grid - with or without grouping */}
                {groupedEntries ? (
                  <div className="space-y-8">
                    {Array.from(groupedEntries.entries()).map(([group, groupEntries]) => (
                      <div key={group}>
                        <div className="flex items-center gap-2 mb-3">
                          <Badge variant="secondary" className="text-sm px-3 py-1 bg-indigo-100 text-indigo-700 border-indigo-200">
                            <Folder className="w-3 h-3 mr-1" />
                            {group}
                          </Badge>
                          <span className="text-sm text-slate-400">
                            ({groupEntries.length} {groupEntries.length === 1 ? 'entry' : 'entries'})
                          </span>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                          {groupEntries.map((entry) => (
                            <EntryCard
                              key={entry.id}
                              entry={entry}
                              onEdit={() => {
                                setEditingEntry(entry);
                                setIsEditDialogOpen(true);
                              }}
                              onDelete={() => handleDeleteEntry(entry.id)}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {filteredEntries.map((entry) => (
                      <EntryCard
                        key={entry.id}
                        entry={entry}
                        onEdit={() => {
                          setEditingEntry(entry);
                          setIsEditDialogOpen(true);
                        }}
                        onDelete={() => handleDeleteEntry(entry.id)}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="raw">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileUp className="w-5 h-5" />
                  Paste tnsnames.ora Content
                </CardTitle>
                <CardDescription>
                  Paste the content of your tnsnames.ora file below to parse and manage it.
                  Use <code className="bg-slate-100 px-1 rounded"># GROUP: GroupName</code> to define groups.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  placeholder={`# GROUP: Production\nORCL_PROD =\n  (DESCRIPTION =\n    (ADDRESS = (PROTOCOL = TCP)(HOST = prod.server.com)(PORT = 1521))\n    (CONNECT_DATA =\n      (SERVICE_NAME = orcl)\n    )\n  )\n\n# GROUP: Development\nORCL_DEV =\n  (DESCRIPTION =\n    (ADDRESS = (PROTOCOL = TCP)(HOST = dev.server.com)(PORT = 1521))\n    (CONNECT_DATA =\n      (SERVICE_NAME = orcl)\n    )\n  )`}
                  value={rawContent}
                  onChange={(e) => setRawContent(e.target.value)}
                  className="min-h-[300px] font-mono text-sm"
                />
                <Button 
                  onClick={handleParseContent} 
                  disabled={isLoading || !rawContent.trim()}
                  className="mt-4 gap-2"
                >
                  {isLoading ? "Parsing..." : "Parse Content"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        {editingEntry && (
          <EntryFormDialog
            title="Edit Connection"
            entry={editingEntry}
            groups={groups}
            onSubmit={handleUpdateEntry}
            onCancel={() => {
              setIsEditDialogOpen(false);
              setEditingEntry(null);
            }}
          />
        )}
      </Dialog>
    </div>
  );
};

// Entry Card Component
interface EntryCardProps {
  entry: TnsEntry;
  onEdit: () => void;
  onDelete: () => void;
}

const EntryCard = ({ entry, onEdit, onDelete }: EntryCardProps) => {
  return (
    <Card className="hover:shadow-md transition-shadow duration-200 border-slate-200">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base font-semibold text-slate-900 truncate">
              {entry.alias}
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 mt-1">
              {entry.description || entry.serviceName}
            </CardDescription>
          </div>
          <div className="flex gap-1 ml-2">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
              <Edit2 className="w-4 h-4 text-slate-500" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onDelete}>
              <Trash2 className="w-4 h-4 text-red-500" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Server className="w-4 h-4 text-slate-400" />
            <span className="text-slate-600 truncate">{entry.host}</span>
            <span className="text-slate-400">:</span>
            <span className="text-slate-700 font-medium">{entry.port}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Globe className="w-4 h-4 text-slate-400" />
            <span className="text-slate-600 truncate">{entry.serviceName}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Network className="w-4 h-4 text-slate-400" />
            <span className="text-slate-500">{entry.protocol || 'TCP'}</span>
          </div>
          {entry.group && (
            <div className="flex items-center gap-2 text-sm">
              <Folder className="w-4 h-4 text-indigo-400" />
              <span className="text-indigo-600">{entry.group}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

// Entry Form Dialog Component
interface EntryFormDialogProps {
  title: string;
  entry?: TnsEntry;
  groups: string[];
  onSubmit: (entry: TnsEntry | Omit<TnsEntry, "id">) => void;
  onCancel?: () => void;
}

const EntryFormDialog = ({ title, entry, groups, onSubmit, onCancel }: EntryFormDialogProps) => {
  const [formData, setFormData] = useState<Omit<TnsEntry, "id">>({
    alias: entry?.alias || "",
    host: entry?.host || "",
    port: entry?.port || "1521",
    serviceName: entry?.serviceName || "",
    protocol: entry?.protocol || "TCP",
    description: entry?.description || "",
    group: entry?.group || "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (entry) {
      setFormData({
        alias: entry.alias || "",
        host: entry.host || "",
        port: entry.port || "1521",
        serviceName: entry.serviceName || "",
        protocol: entry.protocol || "TCP",
        description: entry.description || "",
        group: entry.group || "",
      });
    }
  }, [entry]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.alias.trim()) {
      newErrors.alias = "Alias is required";
    }
    if (!formData.host.trim()) {
      newErrors.host = "Host is required";
    }
    if (!formData.port.trim()) {
      newErrors.port = "Port is required";
    } else if (isNaN(parseInt(formData.port)) || parseInt(formData.port) < 1 || parseInt(formData.port) > 65535) {
      newErrors.port = "Port must be 1-65535";
    }
    if (!formData.serviceName.trim()) {
      newErrors.serviceName = "Service name is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    if (entry) {
      onSubmit({ ...formData, id: entry.id });
    } else {
      onSubmit(formData);
    }
  };

  return (
    <DialogContent className="sm:max-w-[500px]">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          Fill in the connection details below. All fields marked with * are required.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="alias">Alias *</Label>
          <Input
            id="alias"
            value={formData.alias}
            onChange={(e) => setFormData({ ...formData, alias: e.target.value })}
            placeholder="e.g., ORCL, PRODDB, DEVDB"
            className={errors.alias ? "border-red-500" : ""}
          />
          {errors.alias && <p className="text-xs text-red-500">{errors.alias}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="host">Host *</Label>
            <Input
              id="host"
              value={formData.host}
              onChange={(e) => setFormData({ ...formData, host: e.target.value })}
              placeholder="e.g., localhost"
              className={errors.host ? "border-red-500" : ""}
            />
            {errors.host && <p className="text-xs text-red-500">{errors.host}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="port">Port *</Label>
            <Input
              id="port"
              type="number"
              value={formData.port}
              onChange={(e) => setFormData({ ...formData, port: e.target.value })}
              placeholder="1521"
              className={errors.port ? "border-red-500" : ""}
            />
            {errors.port && <p className="text-xs text-red-500">{errors.port}</p>}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="serviceName">Service Name *</Label>
          <Input
            id="serviceName"
            value={formData.serviceName}
            onChange={(e) => setFormData({ ...formData, serviceName: e.target.value })}
            placeholder="e.g., orcl, prod.company.com"
            className={errors.serviceName ? "border-red-500" : ""}
          />
          {errors.serviceName && <p className="text-xs text-red-500">{errors.serviceName}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="protocol">Protocol</Label>
          <select
            id="protocol"
            value={formData.protocol}
            onChange={(e) => setFormData({ ...formData, protocol: e.target.value })}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="TCP">TCP</option>
            <option value="IPC">IPC</option>
            <option value="TCPS">TCPS</option>
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="group">Group</Label>
          <Select 
            value={formData.group || "__none__"} 
            onValueChange={(value) => {
              setFormData({ ...formData, group: value === "__none__" ? "" : value });
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a group" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">No Group</SelectItem>
              {groups.map(g => (
                <SelectItem key={g} value={g}>{g}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Input
            id="description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Optional description"
          />
        </div>

        <div className="flex justify-end gap-3 pt-4">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
            {entry ? "Update" : "Add"} Connection
          </Button>
        </div>
      </form>
    </DialogContent>
  );
};

export default Index;