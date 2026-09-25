const test=require('node:test');
const assert=require('node:assert/strict');
const {conditionalPatch,endpointFor,utf8Bytes,buildUpdatePatch,oversizedStrings,missingProtectedEntities}=require('../firebase-sync.js');

function response({status=200,etag='"etag-1"',json={},text=''}){
  return{
    ok:status>=200&&status<300,
    status,
    headers:{get:name=>String(name).toLowerCase()==='etag'?etag:null},
    json:async()=>json,
    text:async()=>text
  };
}

test('builds an authenticated Firebase REST endpoint without changing the data path',()=>{
  const url=endpointFor('https://example.firebaseio.com/','minizrd_data','token value',{print:'silent'});
  assert.equal(url,'https://example.firebaseio.com/minizrd_data.json?auth=token+value&print=silent');
});

test('writes only changed paths after checking the remote revision',async()=>{
  const calls=[];
  const remote={updatedAt:100,seasons:[{id:'proam'}],drivers:[]};
  const snapshot={updatedAt:101,seasons:[{id:'proam'}],drivers:[]};
  const fetchImpl=async(url,options)=>{
    calls.push({url,options});
    return calls.length===1
      ?response({etag:'"root-version"',json:remote})
      :response({status:204});
  };
  const result=await conditionalPatch({databaseURL:'https://example.firebaseio.com',snapshot,expectedUpdatedAt:100,getIdToken:async()=>'id-token',fetchImpl});
  assert.equal(result.ok,true);
  assert.equal(result.updatedAt,101);
  assert.equal(result.bytes,utf8Bytes(JSON.stringify({updatedAt:101})));
  assert.equal(result.changedPaths,1);
  assert.equal(calls.length,2);
  assert.equal(calls[0].options.headers['X-Firebase-ETag'],'true');
  assert.equal(calls[1].options.method,'PATCH');
  assert.equal(calls[1].options.headers['If-Match'],undefined);
  assert.equal(calls[1].options.body,JSON.stringify({updatedAt:101}));
  assert.match(calls[1].url,/writeSizeLimit=unlimited/);
  assert.match(calls[1].url,/print=silent/);
  assert.equal(result.protectedRecordsChecked,6);
});

test('does not write when the remote revision changed before the save',async()=>{
  let calls=0;
  const result=await conditionalPatch({
    databaseURL:'https://example.firebaseio.com',
    snapshot:{updatedAt:101},
    expectedUpdatedAt:100,
    getIdToken:async()=>'id-token',
    fetchImpl:async()=>{calls++;return response({json:{updatedAt:999}})}
  });
  assert.equal(result.ok,false);
  assert.equal(result.conflict,true);
  assert.equal(result.code,'version-conflict');
  assert.equal(calls,1);
});

test('treats an ETag mismatch as a safe conflict without retrying or overwriting',async()=>{
  let calls=0;
  const result=await conditionalPatch({
    databaseURL:'https://example.firebaseio.com',
    snapshot:{updatedAt:101},
    expectedUpdatedAt:100,
    getIdToken:async()=>'id-token',
    fetchImpl:async()=>{calls++;return calls===1?response({json:{updatedAt:100}}):response({status:412})}
  });
  assert.equal(result.ok,false);
  assert.equal(result.conflict,true);
  assert.equal(result.code,'etag-conflict');
  assert.equal(calls,2);
});

test('surfaces authentication and rules failures with their HTTP status',async()=>{
  await assert.rejects(
    conditionalPatch({databaseURL:'https://example.firebaseio.com',snapshot:{updatedAt:1},expectedUpdatedAt:0,getIdToken:async()=>'bad-token',fetchImpl:async()=>response({status:401,text:'Permission denied'})}),
    error=>error.code==='http-401'&&error.status===401&&/Permission denied/.test(error.message)
  );
});

test('blocks an accidental write that would remove existing Firebase entities',async()=>{
  const remote={updatedAt:100,teams:[{id:'team-safe'},{id:'team-keep'}],drivers:[{id:'driver-safe'}]};
  const snapshot={updatedAt:101,teams:[{id:'team-safe'}],drivers:[{id:'driver-safe'}]};
  let calls=0;
  await assert.rejects(
    conditionalPatch({
      databaseURL:'https://example.firebaseio.com',
      snapshot,
      expectedUpdatedAt:100,
      getIdToken:async()=>'id-token',
      fetchImpl:async()=>{calls++;return response({etag:'"root-version"',json:remote})}
    }),
    error=>error.code==='destructive-write-blocked'&&error.missing.includes('teams/team-keep')
  );
  assert.equal(calls,1,'the destructive payload must never reach the write request');
});

test('permits deletions only when an explicitly confirmed workflow authorizes them',async()=>{
  const remote={updatedAt:100,races:[{id:'race-1'},{id:'race-2'}]};
  const snapshot={updatedAt:101,races:[{id:'race-2'}]};
  const calls=[];
  const result=await conditionalPatch({
    databaseURL:'https://example.firebaseio.com',
    snapshot,
    expectedUpdatedAt:100,
    allowedDeletions:['races/race-1'],
    getIdToken:async()=>'id-token',
    fetchImpl:async(url,options)=>{calls.push({url,options});return calls.length===1?response({etag:'"root-version"',json:remote}):response({status:204})}
  });
  assert.equal(result.ok,true);
  assert.equal(calls.length,2);
});

test('an authorized deletion cannot hide the loss of a different record',async()=>{
  const remote={updatedAt:100,teams:[{id:'team-a'},{id:'team-b'}],drivers:[{id:'driver-a'}]};
  const snapshot={updatedAt:101,teams:[],drivers:[{id:'driver-a'}]};
  let calls=0;
  await assert.rejects(
    conditionalPatch({
      databaseURL:'https://example.firebaseio.com',
      snapshot,
      expectedUpdatedAt:100,
      allowedDeletions:['teams/team-a'],
      getIdToken:async()=>'id-token',
      fetchImpl:async()=>{calls++;return response({etag:'"root-version"',json:remote})}
    }),
    error=>error.code==='destructive-write-blocked'&&error.missing.includes('teams/team-b')&&!error.missing.includes('teams/team-a')
  );
  assert.equal(calls,1);
});

test('reports every protected record missing from a candidate snapshot',()=>{
  const missing=missingProtectedEntities(
    {updatedAt:1,seasons:[{id:'season-1'}],newsHistory:[{id:'news-1'}]},
    {updatedAt:2,seasons:[],newsHistory:[]}
  );
  assert.deepEqual(missing,['seasons/season-1','newsHistory/news-1']);
});

test('builds a minimal multi-location patch without resending unchanged images',()=>{
  const largeImage=`data:image/png;base64,${'A'.repeat(700000)}`;
  const remote={updatedAt:10,teams:[{id:'team-a',name:'A',logo:largeImage}]};
  const snapshot={updatedAt:11,teams:[{id:'team-a',name:'A',logo:largeImage},{id:'team-b',name:'B',logo:'small'}]};
  const patch=buildUpdatePatch(remote,snapshot);
  assert.deepEqual(patch,{updatedAt:11,'teams/1':snapshot.teams[1]});
  assert.ok(utf8Bytes(JSON.stringify(patch))<1000);
});

test('detects any individual Firebase string over 10 MB before writing',()=>{
  const found=oversizedStrings({'teams/8':{logo:'A'.repeat(10*1024*1024+1)}});
  assert.equal(found.length,1);
  assert.equal(found[0].path,'teams/8/logo');
});

test('a database larger than 16 MB sends only the new record through REST PATCH',async()=>{
  const image=`data:image/png;base64,${'A'.repeat(700000)}`;
  const teams=Array.from({length:24},(_,index)=>({id:`team-${index}`,name:`Team ${index}`,logo:image}));
  const remote={updatedAt:500,teams};
  const snapshot={updatedAt:501,teams:[...teams,{id:'team-new',name:'New Team',logo:image}]};
  const fullSnapshotBytes=utf8Bytes(JSON.stringify(snapshot));
  const calls=[];
  const result=await conditionalPatch({
    databaseURL:'https://example.firebaseio.com',
    snapshot,
    expectedUpdatedAt:500,
    getIdToken:async()=>'id-token',
    fetchImpl:async(url,options)=>{calls.push({url,options});return calls.length===1?response({etag:'"large-root"',json:remote}):response({status:204})}
  });
  assert.ok(fullSnapshotBytes>16*1024*1024,`expected a snapshot over 16 MB, got ${fullSnapshotBytes}`);
  assert.ok(result.bytes<1024*1024,`expected an incremental payload under 1 MB, got ${result.bytes}`);
  assert.equal(result.changedPaths,2);
  assert.equal(calls[1].options.method,'PATCH');
  assert.match(calls[1].url,/writeSizeLimit=unlimited/);
  assert.equal(result.ok,true);
});
