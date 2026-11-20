const closing=/^[。、，．？！!?：:；;）)］\]｝}」』】〉》〕〗〙〛ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮー々]/u;
const opening=/[（(［\[｛{「『【〈《〔〖〘〚]$/u;
/** Keep Japanese prohibited line-start/end marks with their adjacent inline unit. */
export function applyKinsoku(node){
 const document=node.ownerDocument,pieces=[];
 for(const child of [...node.childNodes]){
  if(child.nodeType===3)for(const c of [...child.textContent])pieces.push(document.createTextNode(c));
  else pieces.push(child);
 }
 const output=[];
 const baseText=n=>n.nodeType===3?n.textContent:[...n.childNodes].filter(x=>x.nodeType===3||x.nodeName!=='RT').map(x=>x.textContent).join('');
 const group=(a,b)=>{const span=document.createElement('span');span.className='kinsoku-unit';span.append(a,b);return span;};
 for(const piece of pieces){const previous=output.at(-1);if(previous&&(closing.test(baseText(piece))||opening.test(baseText(previous))))output[output.length-1]=group(previous,piece);else output.push(piece);}
 node.replaceChildren(...output);return node;
}
