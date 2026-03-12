import { useAuth } from '@/contexts/AuthContext';
import StaffProjects from './projects/StaffProjects';
import ClientProjects from './projects/ClientProjects';

const ProjectsPage = () => {
  const { loading, isCliente } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="w-6 h-6 border-2 border-muted border-t-muted-foreground rounded-full animate-spin" />
      </div>
    );
  }

  if (isCliente) {
    return <ClientProjects />;
  }

  return <StaffProjects />;
};

export default ProjectsPage;
