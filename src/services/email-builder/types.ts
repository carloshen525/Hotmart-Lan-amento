export type BlockType =
  | 'header'
  | 'text'
  | 'image'
  | 'video'
  | 'button'
  | 'spacer'
  | 'divider'
  | 'columns'
  | 'social'
  | 'footer';

export interface BaseBlock {
  id: string;
  type: BlockType;
}

export interface HeaderBlock extends BaseBlock {
  type: 'header';
  logoUrl?: string;
  logoWidth?: number;
  title?: string;
  subtitle?: string;
  align?: 'left' | 'center' | 'right';
  bg?: string;
  textColor?: string;
}

export interface TextBlock extends BaseBlock {
  type: 'text';
  content: string;
  fontSize?: number;
  color?: string;
  align?: 'left' | 'center' | 'right' | 'justify';
  bold?: boolean;
  italic?: boolean;
  lineHeight?: number;
  paddingY?: number;
}

export interface ImageBlock extends BaseBlock {
  type: 'image';
  url: string;
  previewUrl?: string;
  alt?: string;
  width?: number; // max-width percentual ou px
  align?: 'left' | 'center' | 'right';
  linkUrl?: string;
  borderRadius?: number;
}

export interface VideoBlock extends BaseBlock {
  type: 'video';
  videoUrl: string;
  coverUrl?: string;
  title?: string;
  align?: 'left' | 'center' | 'right';
}

export interface ButtonBlock extends BaseBlock {
  type: 'button';
  text: string;
  url: string;
  bg?: string;
  color?: string;
  fontSize?: number;
  fontFamily?: string;
  borderRadius?: number;
  paddingY?: number;
  paddingX?: number;
  fullWidth?: boolean;
  align?: 'left' | 'center' | 'right';
}

export interface SpacerBlock extends BaseBlock {
  type: 'spacer';
  height: number;
}

export interface DividerBlock extends BaseBlock {
  type: 'divider';
  color?: string;
  thickness?: number;
  style?: 'solid' | 'dashed' | 'dotted';
  marginY?: number;
}

export interface ColumnBlock extends BaseBlock {
  type: 'columns';
  leftContent: EmailBlock[];
  rightContent: EmailBlock[];
  split?: '50-50' | '60-40' | '40-60';
}

export interface SocialLinks {
  instagram?: string;
  facebook?: string;
  youtube?: string;
  whatsapp?: string;
  linkedin?: string;
  tiktok?: string;
  telegram?: string;
  twitter?: string;
  website?: string;
}

export interface SocialBlock extends BaseBlock {
  type: 'social';
  links: SocialLinks;
  align?: 'left' | 'center' | 'right';
  iconSize?: number;
  colorScheme?: 'colored' | 'dark' | 'white';
}

export interface FooterBlock extends BaseBlock {
  type: 'footer';
  text?: string;
  companyName?: string;
  unsubscribeText?: string;
  unsubscribeUrl?: string;
  color?: string;
  fontSize?: number;
}

export type EmailBlock =
  | HeaderBlock
  | TextBlock
  | ImageBlock
  | VideoBlock
  | ButtonBlock
  | SpacerBlock
  | DividerBlock
  | ColumnBlock
  | SocialBlock
  | FooterBlock;

export interface EmailDesignConfig {
  bodyBg: string;
  contentBg: string;
  contentWidth: number;
  fontFamily: string;
  textColor: string;
  borderRadius: number;
}

export interface EmailDocument {
  version: number;
  subject: string;
  settings: EmailDesignConfig;
  blocks: EmailBlock[];
}
