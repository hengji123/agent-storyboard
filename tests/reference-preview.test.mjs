import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bindReferenceAssetActions} from '../public/reference-preview.js';
test('thumbnail previews only, remove stops bubbling and removes only',async()=>{
 const preview={}, remove={};let opens=0,deletes=0,stopped=false;
 bindReferenceAssetActions(preview,remove,()=>opens++,async()=>deletes++);
 preview.onclick({preventDefault(){}});assert.equal(opens,1);assert.equal(deletes,0);
 await remove.onclick({preventDefault(){},stopPropagation(){stopped=true;}});
 assert.equal(stopped,true);assert.equal(opens,1);assert.equal(deletes,1);
});
