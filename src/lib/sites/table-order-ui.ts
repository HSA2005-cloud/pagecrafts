import type { FileMap } from '@/lib/contracts';
import { escapeHtml } from '@/lib/content/slots';

export const WAIT_PAGE_PATH = 'waiter.html';

const ORDER_CTA = /(order now|place order|add to cart)/i;
const MENU_HINT = /data-type=["']menu["']|id=["']menu["']|<h2[^>]*>\s*menu/i;
const DISH_ROW =
    /<(?:li|article|div)[^>]*class=["'][^"']*(?:menu-item|dish|card|item)[^"']*["'][^>]*>[\s\S]*?<\/(?:li|article|div)>/gi;

function dishNameFromBlock(block: string): string {
    const heading = block.match(/<h[3-6][^>]*>([\s\S]*?)<\/h[3-6]>/i)
        || block.match(/<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>/i);
    if (!heading) return '';
    return heading[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function dishPriceFromBlock(block: string): string {
    const price = block.match(/(?:₹|Rs\.?\s*)\s*([\d,]+(?:\.\d+)?)/i)
        || block.match(/\bVaries\b/i);
    if (!price) return '';
    return price[0].replace(/\s+/g, ' ').trim();
}

function extractDishes(html: string): { name: string; price: string }[] {
    const dishes: { name: string; price: string }[] = [];
    const seen = new Set<string>();
    for (const match of html.matchAll(DISH_ROW)) {
        const name = dishNameFromBlock(match[0]);
        if (!name || seen.has(name.toLowerCase())) continue;
        seen.add(name.toLowerCase());
        dishes.push({ name, price: dishPriceFromBlock(match[0]) });
    }
    return dishes;
}

function injectMenuButtons(html: string): string {
    if (!MENU_HINT.test(html)) return html;
    return html.replace(DISH_ROW, (block) => {
        const name = dishNameFromBlock(block);
        if (!name || /data-add-dish=/.test(block)) return block;
        const price = dishPriceFromBlock(block);
        const btn = `<button type="button" class="btn btn-ghost order-add" data-add-dish="${escapeHtml(name)}" data-dish-price="${escapeHtml(price)}">Add</button>`;
        if (/<\/(?:li|article|div)>\s*$/i.test(block)) {
            return block.replace(/<\/(?:li|article|div)>\s*$/i, `${btn}$&`);
        }
        return `${block}${btn}`;
    });
}

function cartDockHtml(): string {
    return `<aside id="order-cart" class="order-cart" hidden aria-live="polite">
<p class="order-cart-title">Your order</p>
<label class="order-cart-table">Table <input id="order-table" type="text" inputmode="numeric" placeholder="12" autocomplete="off" /></label>
<ul id="order-cart-items"></ul>
<p id="order-cart-empty">Add dishes from the menu.</p>
<button type="button" id="order-send" class="btn">Send to waiter</button>
<p id="order-cart-status" class="order-cart-status" hidden role="status"></p>
</aside>`;
}

function cartStyles(): string {
    return `<style id="order-cart-css">
.order-cart{position:fixed;right:1rem;bottom:1rem;z-index:40;width:min(20rem,calc(100vw - 2rem));padding:1rem;border-radius:1rem;background:color-mix(in srgb, canvas 92%, transparent);border:1px solid color-mix(in srgb, CanvasText 18%, transparent);backdrop-filter:blur(12px);box-shadow:0 12px 40px color-mix(in srgb, CanvasText 16%, transparent)}
.order-cart[hidden]{display:none!important}
.order-cart-title{margin:0 0 .5rem;font-weight:700}
.order-cart-table{display:flex;gap:.5rem;align-items:center;margin:0 0 .75rem;font-size:.9rem}
.order-cart-table input{flex:1;min-width:0;padding:.35rem .5rem;border-radius:.5rem;border:1px solid color-mix(in srgb, CanvasText 22%, transparent);background:transparent;color:inherit}
#order-cart-items{list-style:none;margin:0;padding:0;max-height:10rem;overflow:auto}
#order-cart-items li{display:flex;justify-content:space-between;gap:.5rem;padding:.25rem 0;font-size:.9rem}
#order-cart-empty{margin:0 0 .75rem;font-size:.85rem;opacity:.7}
.order-cart-status{margin:.5rem 0 0;font-size:.85rem}
.order-add{margin-top:.5rem}
</style>`;
}

function cartScript(): string {
    return `<script id="order-cart-js">
(function(){
  var KEY='pc-table-orders';
  var cart=[];
  var root=document.getElementById('order-cart');
  var list=document.getElementById('order-cart-items');
  var empty=document.getElementById('order-cart-empty');
  var table=document.getElementById('order-table');
  var status=document.getElementById('order-cart-status');
  var send=document.getElementById('order-send');
  if(!root||!list||!send) return;
  function show(){ root.hidden=false; }
  function render(){
    list.innerHTML='';
    cart.forEach(function(item,i){
      var li=document.createElement('li');
      li.textContent=item.name+(item.price?' · '+item.price:'');
      var rm=document.createElement('button');
      rm.type='button'; rm.textContent='×'; rm.setAttribute('aria-label','Remove');
      rm.onclick=function(){ cart.splice(i,1); render(); };
      li.appendChild(rm); list.appendChild(li);
    });
    empty.hidden=cart.length>0;
    if(cart.length) show();
  }
  document.addEventListener('click', function(e){
    var t=e.target; if(!t||!t.closest) return;
    var btn=t.closest('[data-add-dish]');
    if(!btn) return;
    e.preventDefault();
    cart.push({name:btn.getAttribute('data-add-dish')||'Dish', price:btn.getAttribute('data-dish-price')||''});
    render(); show();
  });
  send.addEventListener('click', function(){
    var tableNo=(table&&table.value||'').trim();
    if(!tableNo){ if(status){ status.hidden=false; status.textContent='Enter your table number.'; } return; }
    if(!cart.length){ if(status){ status.hidden=false; status.textContent='Add at least one dish.'; } return; }
    var ticket={id:String(Date.now()), table:tableNo, items:cart.slice(), at:new Date().toISOString(), status:'new'};
    var all=[];
    try{ all=JSON.parse(localStorage.getItem(KEY)||'[]'); }catch(err){ all=[]; }
    if(!Array.isArray(all)) all=[];
    all.unshift(ticket);
    localStorage.setItem(KEY, JSON.stringify(all));
    cart=[]; render();
    if(status){ status.hidden=false; status.textContent='Sent to waiter for table '+tableNo+'.'; }
  });
  if(/order|cart|menu/i.test(location.hash||'')) show();
})();
</script>`;
}

function wireHtmlPage(html: string): string {
    let next = injectMenuButtons(html);
    if (!/id=["']order-cart["']/.test(next)) {
        next = /<\/body>/i.test(next)
            ? next.replace(/<\/body>/i, `${cartDockHtml()}</body>`)
            : `${next}${cartDockHtml()}`;
    }
    if (!/id=["']order-cart-css["']/.test(next)) {
        next = /<\/head>/i.test(next)
            ? next.replace(/<\/head>/i, `${cartStyles()}</head>`)
            : `${cartStyles()}${next}`;
    }
    if (!/id=["']order-cart-js["']/.test(next)) {
        next = /<\/body>/i.test(next)
            ? next.replace(/<\/body>/i, `${cartScript()}</body>`)
            : `${next}${cartScript()}`;
    }
    return next.replace(
        /(<a\b[^>]*href=["'])([^"']*)(["'][^>]*>)([\s\S]*?)(<\/a>)/gi,
        (full, pre, href, mid, label, close) => {
            if (!ORDER_CTA.test(label.replace(/<[^>]+>/g, ' '))) return full;
            return `${pre}#order-cart${mid}${label}${close}`;
        },
    );
}

function waiterPageHtml(businessName: string): string {
    const name = escapeHtml(businessName.trim() || 'Orders');
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Waiter · ${name}</title>
<style>
body{margin:0;font-family:ui-sans-serif,system-ui,sans-serif;background:#0b121e;color:#f4f7fb;padding:1.25rem}
h1{font-size:1.25rem;margin:0 0 1rem}
.ticket{border:1px solid #243044;border-radius:1rem;padding:1rem;margin:0 0 .75rem;background:#121a28}
.ticket header{display:flex;justify-content:space-between;gap:1rem;margin-bottom:.5rem}
.muted{opacity:.7;font-size:.85rem}
button{margin-top:.5rem;padding:.4rem .75rem;border-radius:.5rem;border:0;background:#d4b56a;color:#05070a;font-weight:600;cursor:pointer}
.empty{opacity:.7}
</style>
</head>
<body>
<h1>Waiter tickets · ${name}</h1>
<p class="muted">Orders guests send from the menu (same browser / device).</p>
<div id="tickets"></div>
<p id="empty" class="empty">No open tickets yet.</p>
<script>
(function(){
  var KEY='pc-table-orders';
  var root=document.getElementById('tickets');
  var empty=document.getElementById('empty');
  function load(){ try{ return JSON.parse(localStorage.getItem(KEY)||'[]'); }catch(e){ return []; } }
  function save(all){ localStorage.setItem(KEY, JSON.stringify(all)); }
  function render(){
    var all=load().filter(function(t){ return t && t.status!=='done'; });
    root.innerHTML='';
    empty.hidden=all.length>0;
    all.forEach(function(t){
      var el=document.createElement('article');
      el.className='ticket';
      el.innerHTML='<header><strong>Table '+String(t.table||'?')+'</strong><span class="muted">'+(t.at?new Date(t.at).toLocaleTimeString():'')+'</span></header>';
      var ul=document.createElement('ul');
      (t.items||[]).forEach(function(item){
        var li=document.createElement('li');
        li.textContent=(item.name||'Dish')+(item.price?' · '+item.price:'');
        ul.appendChild(li);
      });
      el.appendChild(ul);
      var btn=document.createElement('button');
      btn.type='button'; btn.textContent='Mark done';
      btn.onclick=function(){
        var next=load().map(function(x){ return x.id===t.id?Object.assign({},x,{status:'done'}):x; });
        save(next); render();
      };
      el.appendChild(btn);
      root.appendChild(el);
    });
  }
  render();
  setInterval(render, 2000);
})();
</script>
</body>
</html>`;
}

/**
 * Explicit cart + table + waiter flow. Call only when the prompt asked for it.
 */
export function wireTableOrderSite(
    files: FileMap,
    opts: { businessName: string },
): FileMap {
    const next: FileMap = { ...files };
    for (const [path, html] of Object.entries(files)) {
        if (!path.endsWith('.html')) continue;
        if (path === WAIT_PAGE_PATH || path === 'pay.html' || path === 'settings.html') continue;
        next[path] = wireHtmlPage(html);
    }
    next[WAIT_PAGE_PATH] = waiterPageHtml(opts.businessName);
    return next;
}

export function siteHasOrderCta(files: FileMap): boolean {
    return Object.entries(files).some(([path, html]) => {
        if (!path.endsWith('.html')) return false;
        return ORDER_CTA.test(html);
    });
}
