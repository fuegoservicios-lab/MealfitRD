import { useAssessment } from '../context/AssessmentContext';
import InteractiveAssessmentFlow from '../components/assessment/InteractiveAssessmentFlow';

// We removed the old linear Flow completely.

// Main Page Wrapper with Provider
const Assessment = () => {
    return <InteractiveAssessmentFlow />;
};

export default Assessment;
