import { useAuth } from '@/contexts/AuthContext';
import StaffProjects from './projects/StaffProjects';
import ClientProjects from './projects/ClientProjects';
import NebuLoader from '../components/brand/NebuLoader';

const ProjectsPage = () => {
  const { loading, isCliente } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <NebuLoader size={140} />
      </div>
    );
  }

  if (isCliente) {
    return <ClientProjects />;
  }

  return <StaffProjects />;
};

export default ProjectsPage;
