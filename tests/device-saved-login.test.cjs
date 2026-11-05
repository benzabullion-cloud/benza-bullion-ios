const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('App/public/index.html','utf8');
const code=html.slice(html.indexOf('async function handleAuth('),html.indexOf('async function onSignedIn('));

async function run({checked=true,valid=true,saved=false,unavailable=false,cancelled=false,saveFails=false}={}){
  const events=[];
  const email='test@example.invalid',password='fixture-password';
  const elements={authEmail:{value:email},authPassword:{value:password},authRemember:{checked},authStatus:{}};
  const context={
    authMode:'login',authRequestGeneration:0,currentUser:null,guestBrowsing:false,
    document:{getElementById:id=>elements[id]},
    setAuthError(){},initSupabase(){},saveRememberedLogin(){},updateAuthPasswordControls(){},configureSavedLogin(){},
    onSignedIn(){events.push('open');},
    savedLoginPlugin(){return {
      requestPassword:async()=>cancelled?{cancelled:true}:{email,password},
      savePassword:async credentials=>{
        events.push('save');
        assert.equal(credentials.email,email);
        assert.equal(credentials.password,password);
        if(saveFails)throw new Error('Keychain unavailable');
      }
    };},
    supabaseClient:{auth:{signInWithPassword:async credentials=>{
      events.push('validate');
      assert.equal(credentials.email,email);
      assert.equal(credentials.password,password);
      return valid?{data:{session:{},user:{id:'test'}}}:{error:new Error('bad login')};
    }}}
  };
  vm.createContext(context);
  vm.runInContext(code,context);
  context.handleAuth.canSavePassword=!unavailable;
  context.handleAuth.savedLoginAvailable=true;
  await context.handleAuth({savedLogin:saved});
  return {events,elements};
}

test('remembered credentials are saved only after a valid manual sign-in and opt-in',async()=>{
  const {events,elements}=await run();
  assert.deepEqual(events,['validate','save','open']);
  assert.equal(elements.authPassword.value,'');
  assert.equal(elements.authRemember.checked,true);
  assert.deepEqual((await run({checked:false})).events,['validate','open']);
  assert.deepEqual((await run({valid:false})).events,['validate']);
  assert.deepEqual((await run({unavailable:true})).events,['validate','open']);
});

test('saved login authenticates without rewriting the Keychain; cancellation stays signed out',async()=>{
  const saved=await run({saved:true,checked:false});
  assert.deepEqual(saved.events,['validate','open']);
  assert.equal(saved.elements.authRemember.checked,true);
  assert.deepEqual((await run({saved:true,cancelled:true})).events,[]);
});

test('Keychain save failure does not block a valid password login',async()=>{
  const {events,elements}=await run({saveFails:true});
  assert.deepEqual(events,['validate','save','open']);
  assert.match(elements.authStatus.textContent,/Could not save/);
});
