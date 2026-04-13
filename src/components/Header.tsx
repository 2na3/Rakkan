import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import './header.css';

export interface HeaderNavItem {
  label:    string;
  href?:    string;
  active?:  boolean;
  onClick?: () => void;
}

export interface HeaderProps extends Omit<ComponentPropsWithoutRef<'header'>, 'children'> {
  /** ブランド名テキスト */
  brandName?: string;
  /** ブランドロゴ（SVG や img など。指定すると brandName より優先） */
  brandLogo?: ReactNode;
  /** ブランドロゴ/名称クリック */
  onBrandClick?: () => void;

  /** ナビゲーション項目（指定しなければナビエリア非表示） */
  navItems?: HeaderNavItem[];

  /** CTA ボタンのラベル（指定しなければ非表示） */
  ctaLabel?:   string;
  /** CTA ボタンクリック */
  onCtaClick?: () => void;

  /** ユーザーアバターを表示するか */
  showUserAvatar?: boolean;
  /** ユーザー名（イニシャル生成に使用。省略時は「U」） */
  userName?: string;
  /** アバタークリック */
  onAvatarClick?: () => void;

  /** ページ上部に fixed 固定するか */
  sticky?: boolean;
}

/** ユーザー名から最大2文字のイニシャルを生成 */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Header({
  brandName,
  brandLogo,
  onBrandClick,
  navItems,
  ctaLabel,
  onCtaClick,
  showUserAvatar = false,
  userName = '',
  onAvatarClick,
  sticky = false,
  className,
  ...props
}: HeaderProps) {
  const rootClass = [
    'osahou-header',
    sticky ? 'osahou-header--sticky' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const hasActions = ctaLabel || showUserAvatar;

  return (
    <header className={rootClass} {...props}>
      <div className="osahou-header__inner">

        {/* ── 左：ブランド ── */}
        <div
          className="osahou-header__brand"
          role={onBrandClick ? 'button' : undefined}
          tabIndex={onBrandClick ? 0 : undefined}
          onClick={onBrandClick}
          onKeyDown={onBrandClick
            ? (e) => { if (e.key === 'Enter' || e.key === ' ') onBrandClick(); }
            : undefined}
        >
          {brandLogo
            ? <span className="osahou-header__logo">{brandLogo}</span>
            : null}
          {brandName && (
            <span className="osahou-header__brand-name">{brandName}</span>
          )}
        </div>

        {/* ── 中央：ナビゲーション ── */}
        {navItems && navItems.length > 0 && (
          <nav className="osahou-header__nav" aria-label="メインナビゲーション">
            {navItems.map((item) => (
              <a
                key={item.label}
                href={item.href ?? '#'}
                className={[
                  'osahou-header__nav-item',
                  item.active ? 'osahou-header__nav-item--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-current={item.active ? 'page' : undefined}
                onClick={item.onClick
                  ? (e) => { e.preventDefault(); item.onClick!(); }
                  : undefined}
              >
                {item.label}
              </a>
            ))}
          </nav>
        )}

        {/* ── 右：アクション群 ── */}
        {hasActions && (
          <div className="osahou-header__actions">
            {ctaLabel && (
              <button
                type="button"
                className="osahou-header__cta"
                onClick={onCtaClick}
              >
                {ctaLabel}
              </button>
            )}
            {showUserAvatar && (
              <button
                type="button"
                className="osahou-header__avatar"
                aria-label={userName ? `${userName}のアカウント` : 'アカウント'}
                onClick={onAvatarClick}
              >
                {userName ? getInitials(userName) : 'U'}
              </button>
            )}
          </div>
        )}

      </div>
    </header>
  );
}
