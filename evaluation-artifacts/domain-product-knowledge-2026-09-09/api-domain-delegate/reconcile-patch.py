from pathlib import Path
import re,difflib,json
job=Path(__file__).resolve().parent;patch=(job/'implementation-2.patch').read_text();changes={}
for part in re.split(r'(?=^diff --git )',patch,flags=re.M):
 if not part:continue
 file=re.search(r'^diff --git a/(.*?) b/',part,re.M).group(1);original=Path(file).read_text() if Path(file).exists() else '';text=original
 for j,h in enumerate(re.split(r'(?=^@@ )',part,flags=re.M)[1:]):
  ls=h.splitlines(True)[1:];old=''.join(l[1:] for l in ls if l[:1] in [' ','-']);new=''.join(l[1:] for l in ls if l[:1] in [' ','+'])
  if file=='README.md' and j==0:old=old[:-1];new=new[:-1]
  if file=='src/components/DomainView.tsx' and j==5:
   old=old.replace('  const handleGuidelinesChange', '  };\n\n  const handleGuidelinesChange')
  if file=='src/components/DomainView.tsx' and j==9:
   old=old.replace('          {/* Topics Grid */}','        {/* Topics Grid */}').replace('          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">','        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">')
  assert text.count(old)==1,(file,j,text.count(old));text=text.replace(old,new,1)
 changes[file]=(original,text,'+++ /dev/null' in part)
final=''
for p,(a,b,deleted) in changes.items():final+=''.join(difflib.unified_diff(a.splitlines(True),b.splitlines(True),fromfile='a/'+p if a else '/dev/null',tofile='/dev/null' if deleted else 'b/'+p))
(job/'reconciled.patch').write_text(final);print('Reconciled',len(changes),'files')
