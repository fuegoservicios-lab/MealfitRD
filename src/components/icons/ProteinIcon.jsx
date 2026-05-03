import PropTypes from 'prop-types';

const ProteinIcon = ({ size = 24 }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: 'block' }}
    >
        {/* Base pair rungs */}
        <line x1="3" y1="2.5" x2="21" y2="2.5" stroke="#93C5FD" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="3" y1="9" x2="21" y2="9" stroke="#93C5FD" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="3" y1="15" x2="21" y2="15" stroke="#93C5FD" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="3" y1="21.5" x2="21" y2="21.5" stroke="#93C5FD" strokeWidth="1.8" strokeLinecap="round" />

        {/* Strand A - front/darker */}
        <path
            d="M 3 2.5 C 3 5.5, 21 5.5, 21 9 C 21 12.5, 3 12, 3 15 C 3 18, 21 18, 21 21.5"
            stroke="#1D4ED8"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
        />

        {/* Strand B - back/lighter */}
        <path
            d="M 21 2.5 C 21 5.5, 3 5.5, 3 9 C 3 12.5, 21 12, 21 15 C 21 18, 3 18, 3 21.5"
            stroke="#60A5FA"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
        />

        {/* Endpoint nucleotides */}
        <circle cx="3" cy="2.5" r="2" fill="#1D4ED8" />
        <circle cx="21" cy="2.5" r="2" fill="#60A5FA" />
        <circle cx="3" cy="21.5" r="2" fill="#60A5FA" />
        <circle cx="21" cy="21.5" r="2" fill="#1D4ED8" />
    </svg>
);

ProteinIcon.propTypes = {
    size: PropTypes.number,
    strokeWidth: PropTypes.number
};

export default ProteinIcon;
