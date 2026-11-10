import { Typography as MuiTypography } from '@mui/material';
import type { TypographyProps } from '@mui/material';

export default function Text({ children, variant = 'body1', sx, ...props }: TypographyProps) {
  const getTypographyStyles = () => {
    switch (variant) {
      case 'h5':
        return {
          fontWeight: 800,
          color: 'text.primary',
          letterSpacing: '-0.03em',
        };
      case 'caption':
        return {
          color: 'text.secondary',
          fontWeight: 600,
          textTransform: 'uppercase',
          fontSize: '0.7rem',
        };
      default:
        return {
          color: 'text.primary',
        };
    }
  };

  return (
    <MuiTypography
      variant={variant}
      sx={{
        ...getTypographyStyles(),
        ...sx,
      }}
      {...props}
    >
      {children}
    </MuiTypography>
  );
}
