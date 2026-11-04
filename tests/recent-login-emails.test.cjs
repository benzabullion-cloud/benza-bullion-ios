const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('App/public/index.html','utf8');
function setup(){
 const map=new Map(),remember={checked:true},nodes={authRemember:remember};
 const c={document:{getElementById:id=>nodes[id]??null},localStorage:{getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)}};
 vm.createContext(c);
 vm.runInContext(html.slice(html.indexOf("const BENZA_RECENT_EMAILS="),html.indexOf('async function requestPasswordReset()')),c);
 return {c,map,remember};
}
test('recent logins are capped and duplicates move to the front',()=>{
 const {c}=setup();
 for(let i=0;i<6;i++)c.saveRememberedLogin('user'+i+'@example.com');
 c.saveRememberedLogin('USER3@example.com');
 assert.deepEqual(Array.from(c.recentLoginEmails()),['USER3@example.com','user5@example.com','user4@example.com','user2@example.com']);
});
test('previous remembered email is recognized and clearing removes both stores',()=>{
 const {c,map,remember}=setup();
 map.set('benzaRememberedEmail','prior@example.com');
 assert.deepEqual(Array.from(c.recentLoginEmails()),['prior@example.com']);
 remember.checked=false;
 c.saveRememberedLogin('private@example.com');
 assert.equal(map.size,0);
});
