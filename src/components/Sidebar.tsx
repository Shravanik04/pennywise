import { useEffect, useRef, useState } from 'react'
import { LayoutDashboard, ReceiptText, Wallet, Sparkles, MessageCircle, CircleHelp, Settings, Menu, X } from 'lucide-react'

const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Expenses', icon: ReceiptText },
  { label: 'Budgets', icon: Wallet },
  { label: 'Insights', icon: Sparkles },
  { label: 'Ask Penny', icon: MessageCircle },
]

type SidebarProps = { active: string; onNavigate: (item: string) => void; accountLabel: string; accountDetail: string }

export default function Sidebar({ active, onNavigate, accountLabel, accountDetail }: SidebarProps) {
  const [open, setOpen] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)
  const choose = (label: string) => { onNavigate(label); setOpen(false) }
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); menuButton.current?.focus() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  return <>
    <button ref={menuButton} className="mobile-menu" onClick={() => setOpen(!open)} aria-label={open ? 'Close navigation' : 'Open navigation'} aria-expanded={open} aria-controls="primary-navigation">{open ? <X size={20} /> : <Menu size={20} />}</button>
    {open && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setOpen(false)} />}
    <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
      <div className="sidebar-header">
        <div className="brand"><span className="brand-mark">p.</span><span>pennywise</span><span className="brand-dot">✳</span></div>
        <div className="workspace-switch"><span className="workspace-avatar">{accountLabel[0]?.toUpperCase() ?? 'P'}</span><span className="workspace-copy"><b>{accountLabel}</b><small>{accountDetail}</small></span></div>
      </div>
      <div className="nav-label">MENU</div>
      <nav className="main-nav" id="primary-navigation" aria-label="Primary navigation">{navItems.map(({ label, icon: Icon }) => <button key={label} className={`nav-item ${active === label ? 'active' : ''}`} aria-current={active === label ? 'page' : undefined} onClick={() => choose(label)}><Icon size={18} strokeWidth={1.8} /><span>{label}</span></button>)}</nav>
      <div className="sidebar-bottom">
        <div className="upgrade-card"><div className="upgrade-icon"><Sparkles size={17} /></div><b>Your saved data</b><p>{accountDetail === 'Supabase account' ? 'Expenses and budgets are private to your signed-in account.' : 'Expenses and budgets stay in this browser.'}</p><button onClick={() => choose('Insights')}>View calculated insights <span>↗</span></button></div>
        <button className="nav-item muted" onClick={() => choose('Help & support')}><CircleHelp size={18} /><span>Help & support</span></button>
        <button className="nav-item muted" onClick={() => choose('Settings')}><Settings size={18} /><span>Settings</span></button>
        <div className="profile"><div className="profile-avatar">{accountLabel[0]?.toUpperCase() ?? 'P'}</div><div className="profile-copy"><b>{accountLabel}</b><small>{accountDetail}</small></div></div>
      </div>
    </aside>
  </>
}
