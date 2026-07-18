export const colors = {
  primary: '#146B52',
  primaryPressed: '#0F5742',
  canvas: '#F7F9F7',
  surface: '#FFFFFF',
  text: '#17332B',
  secondary: '#52665F',
  border: '#D8E2DD',
  success: { foreground: '#18794E', background: '#E8F5EE' },
  warning: { foreground: '#8A5A00', background: '#FFF4D6' },
  error: { foreground: '#B42318', background: '#FEEDEC' },
  info: { foreground: '#175CD3', background: '#EAF2FF' },
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radii = { control: 10, panel: 12, pill: 999 } as const;
export const type = {
  h1: { fontSize: 24, lineHeight: 32, fontWeight: '600' },
  h2: { fontSize: 20, lineHeight: 28, fontWeight: '600' },
  h3: { fontSize: 18, lineHeight: 26, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  action: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
  secondary: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
} as const;
