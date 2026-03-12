import { FolderPlus, MoreHorizontal, CheckCircle2, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Project {
  id: string;
  title: string;
  client: string;
  status: 'Active' | 'Completed' | 'On Hold';
  progress: number;
  dueDate: string;
}

const mockProjects: Project[] = [
  { id: '1', title: 'Website Redesign', client: 'Acme Corp', status: 'Active', progress: 65, dueDate: 'Oct 15, 2023' },
  { id: '2', title: 'Mobile App V2', client: 'Globex Inc', status: 'Completed', progress: 100, dueDate: 'Sep 20, 2023' },
  { id: '3', title: 'Brand Guidelines', client: 'Initech', status: 'On Hold', progress: 20, dueDate: 'Nov 01, 2023' },
  { id: '4', title: 'E-commerce Platform', client: 'Umbrella Corp', status: 'Active', progress: 40, dueDate: 'Dec 10, 2023' },
];

const getStatusBadge = (status: Project['status']) => {
  switch (status) {
    case 'Active':
      return <Badge variant="default" className="bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 border-blue-500/20">Active</Badge>;
    case 'Completed':
      return <Badge variant="default" className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/20">Completed</Badge>;
    case 'On Hold':
      return <Badge variant="secondary" className="bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border-amber-500/20">On Hold</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

const ProjectsPage = () => {
  const totalProjects = mockProjects.length;
  const activeProjects = mockProjects.filter((p) => p.status === 'Active').length;
  const completedProjects = mockProjects.filter((p) => p.status === 'Completed').length;

  return (
    <div className="space-y-8 max-w-6xl mx-auto w-full pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Projects</h1>
          <p className="text-muted-foreground mt-1">Manage and track your ongoing projects.</p>
        </div>
        <Button className="gap-2">
          <FolderPlus className="w-4 h-4" />
          New Project
        </Button>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Projects</CardTitle>
            <FolderPlus className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalProjects}</div>
            <p className="text-xs text-muted-foreground">
              +10% from last month
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeProjects}</div>
            <p className="text-xs text-muted-foreground">
              Currently in progress
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedProjects}</div>
            <p className="text-xs text-muted-foreground">
              Successfully delivered
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Projects</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead className="text-right">Due Date</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockProjects.map((project) => (
                <TableRow key={project.id}>
                  <TableCell className="font-medium">{project.title}</TableCell>
                  <TableCell className="text-muted-foreground">{project.client}</TableCell>
                  <TableCell>{getStatusBadge(project.status)}</TableCell>
                  <TableCell className="w-[200px]">
                    <div className="flex items-center gap-2">
                      <Progress value={project.progress} className="h-2" />
                      <span className="text-xs text-muted-foreground w-8">{project.progress}%</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">{project.dueDate}</TableCell>
                  <TableCell className="w-[50px]">
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProjectsPage;
