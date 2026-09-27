import { useAuth } from '@/contexts/AuthContext';
import StaffProjects from './projects/StaffProjects';
import ClientProjects from './projects/ClientProjects';
import LoadingSquares from '../components/brand/LoadingSquares';

const ProjectsPage = () => {
  const { loading, isCliente } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <LoadingSquares size={40} />
      </div>
    );
  }

  if (isCliente) {
    return <ClientProjects />;
  }

  return <StaffProjects />;
};

export default ProjectsPage;
