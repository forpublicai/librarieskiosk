// Libraries Kiosk components. Global: window.Kiosk. Load React 18, tokens.css, bundle.css, then bundle.js.
import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, MouseEventHandler } from 'react';

export type IconName =
  | 'chat' | 'image' | 'music' | 'video' | 'code' | 'send' | 'stop' | 'plus' | 'back' | 'home' | 'user'
  | 'credits' | 'sun' | 'moon' | 'signout' | 'copy' | 'download' | 'help' | 'check' | 'alert' | 'menu' | 'close';

export interface IconProps {
  /** Which icon to draw. */
  name: IconName;
  /** Pixel size. Default 24. */
  size?: number;
  /** Accessible name. Only when the icon stands alone and carries meaning. */
  label?: string;
  className?: string;
}
export declare function Icon(props: IconProps): JSX.Element;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Default 'secondary'. One 'primary' per view. */
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  /** 'md' is 48px, 'lg' is 56px. Default 'md'. */
  size?: 'md' | 'lg';
  /** Icon before the label. */
  icon?: IconName;
  /** Icon after the label. */
  iconEnd?: IconName;
  /** Fill the container width. */
  block?: boolean;
  /** The label: a verb in sentence case. */
  children: ReactNode;
}
export declare function Button(props: ButtonProps): JSX.Element;

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  /** Required accessible name, also the tooltip. */
  label: string;
  /** Default 'quiet'. */
  variant?: 'quiet' | 'primary';
  size?: 'md' | 'lg';
}
export declare function IconButton(props: IconButtonProps): JSX.Element;

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Visible label above the field. */
  label: string;
  /** Help text under the field. */
  hint?: string;
  /** Error text. Replaces the hint and marks the field invalid. */
  error?: string;
  /** Render a textarea for long prompts. */
  multiline?: boolean;
}
export declare function TextField(props: TextFieldProps): JSX.Element;

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: IconName;
  /** Set true or false to make the chip a toggle. Leave undefined for a plain action. */
  selected?: boolean;
  children: ReactNode;
}
export declare function Chip(props: ChipProps): JSX.Element;

export interface NoticeProps {
  /** Default 'info'. */
  tone?: 'info' | 'success' | 'warning' | 'danger';
  /** One short sentence naming the state. */
  title?: ReactNode;
  /** The next step. */
  children?: ReactNode;
  /** Optional Button at the end. */
  action?: ReactNode;
  className?: string;
}
export declare function Notice(props: NoticeProps): JSX.Element;

export interface SpinnerProps {
  /** What is happening, e.g. "Making your image…". */
  label?: string;
  /** Pixel size. Default 22. */
  size?: number;
  className?: string;
}
export declare function Spinner(props: SpinnerProps): JSX.Element;

export interface CreditBadgeProps {
  credits: number;
  /** Tooltip text, e.g. "Monday at 12:00 AM". */
  renewsAt?: string;
  /** At or below this the badge shows a warning. Default 5. */
  lowAt?: number;
  className?: string;
}
export declare function CreditBadge(props: CreditBadgeProps): JSX.Element;

export interface AppHeaderProps {
  /** The Public AI Libraries Project logo (lib-logo.png), the same in both themes. */
  logoSrc?: string;
  /** Current tool name, shown on the right before the credits. Omit on Home. */
  title?: string;
  /** Shows the tool's small shape before the title. */
  tool?: ToolName;
  /** Shows a Home button with a back arrow, after the logo. */
  onBack?: MouseEventHandler;
  credits?: number;
  renewsAt?: string;
  /** Omit for guests. */
  onAccount?: MouseEventHandler;
  onToggleTheme?: MouseEventHandler;
  /** Current theme, used for the toggle label. */
  theme?: 'light' | 'dark';
  onSignOut?: MouseEventHandler;
  /** Default "Sign out". Guests: "End session". */
  signOutLabel?: string;
  /** Extra items before the credits. */
  children?: ReactNode;
}
export declare function AppHeader(props: AppHeaderProps): JSX.Element;

export type ToolName = 'chat' | 'image' | 'music' | 'video' | 'code';

export interface ToolShapeProps {
  tool: ToolName;
  /** Pixel size. Default 120. */
  size?: number;
  className?: string;
}
export declare function ToolShape(props: ToolShapeProps): JSX.Element;

export interface HighlightProps {
  /** The one key word to mark with the sun highlight. */
  children: ReactNode;
  className?: string;
}
export declare function Highlight(props: HighlightProps): JSX.Element;

export interface ModeCardProps {
  /** Sets the tint and the shape. */
  tool: ToolName;
  /** One word: Chat, Image, Music, Video, Code. */
  title: string;
  /** One plain sentence. */
  description: string;
  /** Cost of one use, from calculateCredits. */
  cost?: string;
  /** Solid red-strong field for the first, most-used tool. */
  hero?: boolean;
  /** Renders a link when set. */
  href?: string;
  onClick?: MouseEventHandler;
  className?: string;
}
export declare function ModeCard(props: ModeCardProps): JSX.Element;

export interface ConversationItemProps {
  title: string;
  /** Short date, e.g. "Today". */
  meta?: string;
  icon?: IconName;
  /** The open conversation. */
  selected?: boolean;
  onClick?: MouseEventHandler;
  className?: string;
}
export declare function ConversationItem(props: ConversationItemProps): JSX.Element;

export interface ChatMessageProps {
  /** Default 'assistant'. */
  role?: 'user' | 'assistant';
  /** The message: text, paragraphs, lists, pre/code, images. */
  children?: ReactNode;
  /** Quiet Buttons under an assistant reply. */
  actions?: ReactNode;
  /** Optional timestamp. */
  time?: string;
  /** true or a status string: shows the spinner in place of a reply. */
  thinking?: boolean | string;
  className?: string;
}
export declare function ChatMessage(props: ChatMessageProps): JSX.Element;

export interface ComposerProps {
  placeholder?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Called with the trimmed text on Enter or the send button. */
  onSend?: (text: string) => void;
  /** The AI is working: shows Stop in place of Send. */
  busy?: boolean;
  onStop?: MouseEventHandler;
  /** Line under the box. false hides it. */
  hint?: string | false;
  /** Screen-reader label. Default "Message". */
  label?: string;
  id?: string;
  className?: string;
}
export declare function Composer(props: ComposerProps): JSX.Element;
