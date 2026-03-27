import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Eye, EyeOff } from "lucide-react";

const SettingsPage = () => {
  const [settings, setSettings] = useState({ cc_api_base_url: "", cc_api_key: "", claude_api_key: "" });
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showCcKey, setShowCcKey] = useState(false);
  const [showClaudeKey, setShowClaudeKey] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("settings").select("*").limit(1).single();
      if (data) {
        setSettings({ cc_api_base_url: data.cc_api_base_url, cc_api_key: data.cc_api_key, claude_api_key: data.claude_api_key });
        setSettingsId(data.id);
      }
    };
    load();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      if (settingsId) {
        const { error } = await supabase.from("settings").update(settings).eq("id", settingsId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("settings").insert(settings);
        if (error) throw error;
      }
      toast({ title: "Settings saved" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>CartonCloud API Base URL</Label>
            <Input value={settings.cc_api_base_url} onChange={(e) => setSettings((s) => ({ ...s, cc_api_base_url: e.target.value }))} placeholder="https://api.cartoncloud.com/api/v2" />
          </div>
          <div className="space-y-2">
            <Label>CartonCloud API Key</Label>
            <div className="flex gap-2">
              <Input type={showCcKey ? "text" : "password"} value={settings.cc_api_key} onChange={(e) => setSettings((s) => ({ ...s, cc_api_key: e.target.value }))} />
              <Button size="icon" variant="ghost" onClick={() => setShowCcKey(!showCcKey)}>{showCcKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Claude API Key</Label>
            <div className="flex gap-2">
              <Input type={showClaudeKey ? "text" : "password"} value={settings.claude_api_key} onChange={(e) => setSettings((s) => ({ ...s, claude_api_key: e.target.value }))} />
              <Button size="icon" variant="ghost" onClick={() => setShowClaudeKey(!showClaudeKey)}>{showClaudeKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
            </div>
          </div>
          <Button onClick={save} disabled={saving} className="w-full">
            {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving…</> : "Save Settings"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsPage;
