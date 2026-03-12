import { Save, User, Bell, Shield, Mail, Key, Smartphone } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const SettingsPage = () => {
  return (
    <div className="space-y-8 max-w-6xl mx-auto w-full pb-10">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account settings and preferences.</p>
      </div>

      <Tabs defaultValue="profile" className="flex flex-col md:flex-row gap-6">
        {/* Sidebar Navigation */}
        <TabsList className="flex flex-col h-auto bg-transparent items-start w-full md:w-64 space-y-2 p-0">
          <TabsTrigger
            value="profile"
            className="w-full justify-start gap-2 data-[state=active]:bg-muted data-[state=active]:shadow-none hover:bg-muted/50 rounded-lg px-4 py-2"
          >
            <User className="h-4 w-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger
            value="notifications"
            className="w-full justify-start gap-2 data-[state=active]:bg-muted data-[state=active]:shadow-none hover:bg-muted/50 rounded-lg px-4 py-2"
          >
            <Bell className="h-4 w-4" />
            Notifications
          </TabsTrigger>
          <TabsTrigger
            value="security"
            className="w-full justify-start gap-2 data-[state=active]:bg-muted data-[state=active]:shadow-none hover:bg-muted/50 rounded-lg px-4 py-2"
          >
            <Shield className="h-4 w-4" />
            Security
          </TabsTrigger>
        </TabsList>

        {/* Content Area */}
        <div className="flex-1">
          {/* Profile Tab */}
          <TabsContent value="profile" className="m-0 focus-visible:outline-none focus-visible:ring-0">
            <Card>
              <CardHeader>
                <CardTitle>Profile Information</CardTitle>
                <CardDescription>
                  Update your personal details and public profile.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input id="fullName" placeholder="Jane Doe" defaultValue="Alex Smith" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input id="email" type="email" placeholder="jane.doe@example.com" defaultValue="alex@acmecorp.com" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="bio">Bio</Label>
                  <Input id="bio" placeholder="Tell us a little bit about yourself" defaultValue="Senior Product Manager" />
                </div>
              </CardContent>
              <CardFooter className="border-t border-border pt-6 flex justify-end">
                <Button className="gap-2">
                  <Save className="h-4 w-4" />
                  Save Changes
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="m-0 focus-visible:outline-none focus-visible:ring-0">
            <Card>
              <CardHeader>
                <CardTitle>Notification Preferences</CardTitle>
                <CardDescription>
                  Choose how and when you want to be notified.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between space-x-2">
                  <div className="flex flex-col space-y-1">
                    <span className="flex items-center gap-2 font-medium">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      Email Alerts
                    </span>
                    <span className="text-sm text-muted-foreground">Receive daily summaries and critical alerts via email.</span>
                  </div>
                  <Switch defaultChecked id="email-alerts" />
                </div>

                <div className="h-px bg-border my-4" />

                <div className="flex items-center justify-between space-x-2">
                  <div className="flex flex-col space-y-1">
                    <span className="flex items-center gap-2 font-medium">
                      <Smartphone className="h-4 w-4 text-muted-foreground" />
                      Push Notifications
                    </span>
                    <span className="text-sm text-muted-foreground">Get instant notifications on your mobile device.</span>
                  </div>
                  <Switch id="push-notifications" />
                </div>

                <div className="h-px bg-border my-4" />

                <div className="flex items-center justify-between space-x-2">
                  <div className="flex flex-col space-y-1">
                    <span className="flex items-center gap-2 font-medium">
                      <Bell className="h-4 w-4 text-muted-foreground" />
                      Marketing Updates
                    </span>
                    <span className="text-sm text-muted-foreground">Receive news, updates, and promotional offers.</span>
                  </div>
                  <Switch id="marketing-updates" />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security" className="m-0 focus-visible:outline-none focus-visible:ring-0">
            <Card>
              <CardHeader>
                <CardTitle>Security Settings</CardTitle>
                <CardDescription>
                  Manage your password and security preferences.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                 <div className="flex items-center justify-between space-x-2">
                  <div className="flex flex-col space-y-1">
                    <span className="flex items-center gap-2 font-medium">
                      <Key className="h-4 w-4 text-muted-foreground" />
                      Two-Factor Authentication (2FA)
                    </span>
                    <span className="text-sm text-muted-foreground">Add an extra layer of security to your account.</span>
                  </div>
                  <Button variant="outline">Enable</Button>
                </div>

                <div className="h-px bg-border my-4" />

                <div className="space-y-4">
                  <h4 className="font-medium">Change Password</h4>
                  <div className="grid gap-2">
                    <Label htmlFor="current-password">Current Password</Label>
                    <Input id="current-password" type="password" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="new-password">New Password</Label>
                    <Input id="new-password" type="password" />
                  </div>
                </div>
              </CardContent>
              <CardFooter className="border-t border-border pt-6 flex justify-end">
                <Button>Update Password</Button>
              </CardFooter>
            </Card>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};

export default SettingsPage;
