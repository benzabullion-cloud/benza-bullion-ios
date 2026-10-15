from pathlib import Path
import re

path = Path('App/public/index.html')
s = path.read_text()

MARKER = 'benza-direct-ui-2026-10-15'
if MARKER in s:
    print('Direct UI patch already present')
    raise SystemExit(0)

# Static Founder value copy: insert directly after every Founder StoreKit offer line.
founder_pattern = re.compile(r'(<span\s+data-store-offer="founder"[^>]*>.*?</span>)', re.S)
founder_matches = list(founder_pattern.finditer(s))
if not founder_matches:
    raise SystemExit('No Founder StoreKit offer span found in App/public/index.html')
founder_copy = '<span class="founderFutureValue">Future lifetime price: $74.99 · Founder savings: $49.99</span>'
s = founder_pattern.sub(lambda m: m.group(1) + founder_copy, s)

# Replace the existing guest banners in the real bundled HTML.
old_guest = '''    <div class="guestBrowseTools">
      <p>Browse prices and news. Sign in to save your bullion portfolio.</p>
      <div class="guestBrowseActions"><button type="button" onclick="requestAccountAccess('save your bullion portfolio')">Sign in / Create account</button><button type="button" onclick="openProUpgrade()">Pro plans</button></div>
      <div class="guestBrowseLinks"><a href="privacy.html">Privacy</a><a href="terms.html">Terms</a><a href="support.html">Support</a></div>
    </div>'''
new_guest = '''    <div class="guestBrowseTools benzaGuestCard" data-benza-guest-card="1">
      <div class="benzaGuestEyebrow">GUEST PREVIEW</div>
      <div class="benzaGuestTitle">Explore Benza Bullion</div>
      <p class="benzaGuestCopy">See what the bullion market is doing before you create an account. These tools stay open while you browse.</p>
      <div class="benzaGuestIncluded"><span>✓ Live Markets</span><span>✓ Calculator</span><span>✓ Market Insights</span></div>
      <div class="benzaGuestUnlock"><strong>Want the full experience?</strong> A free account unlocks your personal bullion portfolio, saved holdings, watchlist and portfolio analytics.</div>
      <div class="guestBrowseActions"><button class="benzaGuestPrimary" type="button" onclick="showGuestAccountSheet('build and save your personal bullion portfolio','portfolio')">Create free account</button><button class="benzaGuestSecondary" type="button" onclick="openProUpgrade()">Explore Pro</button></div>
      <div class="guestBrowseLinks"><a href="privacy.html">Privacy</a><a href="terms.html">Terms</a><a href="support.html">Support</a></div>
    </div>'''
guest_count = s.count(old_guest)
if guest_count < 1:
    raise SystemExit('Existing guest banner block not found in App/public/index.html')
s = s.replace(old_guest, new_guest)

style = r'''
<style id="benzaDirectGuestStyle">
.founderFutureValue{display:block;margin-top:6px;color:var(--gold);font-size:10px;font-weight:900;line-height:1.35;letter-spacing:.1px}
.guestBrowseTools.benzaGuestCard{position:relative;overflow:hidden;border:1px solid var(--border);border-radius:18px;background:linear-gradient(145deg,var(--surface2),var(--surface));padding:16px;margin-bottom:18px;box-shadow:0 10px 28px var(--shadow)}
.guestBrowseTools.benzaGuestCard:before{content:"";position:absolute;inset:0 auto auto 0;width:100%;height:2px;background:linear-gradient(90deg,transparent,var(--gold),transparent);opacity:.9}
.benzaGuestEyebrow{font-size:10px;font-weight:900;letter-spacing:1.35px;color:var(--gold);margin-bottom:7px}
.benzaGuestTitle{font-size:18px;font-weight:900;letter-spacing:-.25px;color:var(--text);margin:0 0 5px}
.benzaGuestCopy{font-size:12.5px!important;line-height:1.48;color:var(--muted)!important;margin:0!important}
.benzaGuestIncluded{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0}
.benzaGuestIncluded span{font-size:10px;font-weight:800;color:var(--text);background:var(--surface);border:1px solid var(--border);border-radius:999px;padding:6px 8px;white-space:nowrap}
.benzaGuestUnlock{font-size:11.5px;line-height:1.45;color:var(--muted);border-top:1px solid var(--border);padding-top:11px;margin-top:2px}
.benzaGuestUnlock strong{color:var(--text)}
.guestBrowseTools.benzaGuestCard .guestBrowseActions{margin-top:12px;display:grid;grid-template-columns:1.35fr 1fr;gap:8px}
.guestBrowseTools.benzaGuestCard .guestBrowseActions button{min-height:43px;border-radius:12px;font-size:12px;font-weight:850}
.guestBrowseTools.benzaGuestCard .benzaGuestPrimary{border-color:var(--gold);background:var(--gold);color:#111}
.guestBrowseTools.benzaGuestCard .benzaGuestSecondary{border:1px solid var(--border);background:var(--surface);color:var(--text)}
.guestBrowseTools.benzaGuestCard .guestBrowseLinks{margin-top:10px;gap:14px;font-size:10px}
#benzaGuestLockOverlay{display:none;position:fixed;inset:0;z-index:2147483646;background:var(--overlay);backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px);align-items:flex-end;justify-content:center;padding:16px}
#benzaGuestLockOverlay.show{display:flex}
#benzaGuestLockCard{width:100%;max-width:410px;background:var(--surface);border:1px solid var(--border);border-radius:22px;padding:20px 18px calc(18px + env(safe-area-inset-bottom));box-shadow:0 26px 70px #0006;animation:benzaGuestRise .22s ease-out}
@keyframes benzaGuestRise{from{transform:translateY(22px);opacity:.4}to{transform:translateY(0);opacity:1}}
.benzaGuestLockIcon{width:46px;height:46px;border-radius:15px;display:grid;place-items:center;margin-bottom:13px;background:var(--surface2);border:1px solid var(--border);font-size:21px;color:var(--gold)}
.benzaGuestLockEyebrow{font-size:10px;font-weight:900;letter-spacing:1.25px;color:var(--gold);margin-bottom:5px}
.benzaGuestLockTitle{font-size:21px;font-weight:900;letter-spacing:-.35px;color:var(--text);margin:0 0 7px}
.benzaGuestLockCopy{font-size:13px;line-height:1.5;color:var(--muted);margin:0 0 14px}
.benzaGuestLockBenefits{display:grid;gap:8px;margin:0 0 16px}
.benzaGuestLockBenefit{display:flex;gap:9px;align-items:flex-start;font-size:12px;line-height:1.4;color:var(--text)}
.benzaGuestLockBenefit i{font-style:normal;color:var(--gold);font-weight:900}
.benzaGuestLockActions{display:grid;gap:8px}
.benzaGuestLockActions button{width:100%;min-height:47px;border-radius:13px;font-size:14px;font-weight:850}
.benzaGuestLockCreate{border:1px solid var(--gold);background:var(--gold);color:#111}
.benzaGuestLockSignIn{border:1px solid var(--border);background:var(--surface2);color:var(--text)}
.benzaGuestLockLater{border:0;background:transparent;color:var(--muted);min-height:38px!important}
</style>
'''
if '</head>' not in s:
    raise SystemExit('Missing </head>')
s = s.replace('</head>', f'<meta name="benza-ui-source" content="{MARKER}">\n{style}</head>', 1)

lock_html = '''
<div id="benzaGuestLockOverlay" role="dialog" aria-modal="true" aria-labelledby="benzaGuestLockTitle">
  <div id="benzaGuestLockCard">
    <div class="benzaGuestLockIcon">✦</div>
    <div class="benzaGuestLockEyebrow">FULL BENZA BULLION EXPERIENCE</div>
    <h2 class="benzaGuestLockTitle" id="benzaGuestLockTitle">Make this portfolio yours</h2>
    <p class="benzaGuestLockCopy" id="benzaGuestLockCopy">Create a free account to save your bullion and unlock your personal portfolio.</p>
    <div class="benzaGuestLockBenefits">
      <div class="benzaGuestLockBenefit"><i>✓</i><span>Track your own gold, silver, platinum, palladium and copper holdings</span></div>
      <div class="benzaGuestLockBenefit"><i>✓</i><span>Save watchlists and build portfolio history over time</span></div>
      <div class="benzaGuestLockBenefit"><i>✓</i><span>Unlock personal analytics and keep your data synced securely</span></div>
    </div>
    <div class="benzaGuestLockActions">
      <button class="benzaGuestLockCreate" type="button" onclick="openGuestAuth('signup')">Create free account</button>
      <button class="benzaGuestLockSignIn" type="button" onclick="openGuestAuth('login')">Already have an account? Sign in</button>
      <button class="benzaGuestLockLater" type="button" onclick="closeGuestAccountSheet()">Keep exploring</button>
    </div>
  </div>
</div>
'''

script = r'''
<script id="benzaDirectGuestLogic">
(function(){
  const originalRequest = window.requestAccountAccess;
  window.closeGuestAccountSheet = function(){ document.getElementById('benzaGuestLockOverlay')?.classList.remove('show'); };
  window.openGuestAuth = function(mode='login'){
    window.closeGuestAccountSheet();
    if(typeof window.setAuthMode === 'function') window.setAuthMode(mode === 'signup' ? 'signup' : 'login');
    const screen=document.getElementById('authScreen'); if(screen) screen.style.display='flex';
    const status=document.getElementById('authStatus');
    if(status) status.textContent = mode === 'signup' ? 'Create your free account to save your portfolio and continue where you left off.' : 'Sign in to continue where you left off.';
  };
  window.showGuestAccountSheet = function(reason='use your personal portfolio', route='portfolio'){
    if(window.currentUser) return true;
    window.pendingAccountRoute = route;
    const normalized=String(reason||'').replace(/^to\s+/i,'').replace(/\.$/,'');
    const copy=document.getElementById('benzaGuestLockCopy');
    if(copy) copy.textContent='Create a free account to '+normalized+'. Your guest market browsing stays available.';
    document.getElementById('benzaGuestLockOverlay')?.classList.add('show');
    return false;
  };
  if(typeof originalRequest === 'function'){
    window.requestAccountAccess = function(reason='use your personal portfolio', route='portfolio'){
      if(window.currentUser) return true;
      if(window.guestBrowsing || document.body.classList.contains('guest-mode')) return window.showGuestAccountSheet(reason, route);
      return originalRequest(reason, route);
    };
  }
  document.getElementById('benzaGuestLockOverlay')?.addEventListener('click', function(event){ if(event.target === this) window.closeGuestAccountSheet(); });
  console.info('Benza Bullion bundled UI source: benza-direct-ui-2026-10-15');
})();
</script>
'''
if '</body>' not in s:
    raise SystemExit('Missing </body>')
s = s.replace('</body>', lock_html + script + '\n</body>', 1)

required = [
    MARKER,
    'Future lifetime price: $74.99 · Founder savings: $49.99',
    'Explore Benza Bullion',
    'Make this portfolio yours',
    'Create free account',
    'Keep exploring',
    'benzaDirectGuestLogic'
]
for text in required:
    if text not in s:
        raise SystemExit(f'Missing required direct UI marker: {text}')

path.write_text(s)
print(f'Patched Founder spans: {len(founder_matches)}; guest cards: {guest_count}')
