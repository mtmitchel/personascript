from pathlib import Path
import re,difflib,json
job=Path(__file__).resolve().parent
patch=(job/'implementation.patch').read_text();changes={};repairs=[]
for part in re.split(r'(?=^diff --git )',patch,flags=re.M):
 if not part:continue
 file=re.search(r'^\+\+\+ b/(.*)$',part,re.M).group(1);original=Path(file).read_text();text=original
 for j,h in enumerate(re.split(r'(?=^@@ )',part,flags=re.M)[1:]):
  lines=h.splitlines(keepends=True)[1:];old=''.join(l[1:] for l in lines if l[:1] in [' ','-']);new=''.join(l[1:] for l in lines if l[:1] in [' ','+']);n=text.count(old)
  if file=='README.md' and j==0:
   old=old[:-1];new=new[:-1];repairs.append('README: removed nonexistent trailing blank context line.')
  if file=='server.ts' and j in [4,5]:
   old='    const activeDomain = domainExpertise || profile?.domainExpertise;';new='    const activeDomain = normalizeDomainExpertise(domainExpertise || profile?.domainExpertise);';repairs.append(f'server hunk {j}: applied exact changed statement; kept actual surrounding flow.')
  if file=='src/components/DomainView.tsx' and j==21:
   old=old.replace('user value rather','user value delivered rather');new=new.replace('user value rather','user value delivered rather');repairs.append('DomainView: corrected unchanged context to actual wording.')
  n=text.count(old)
  if n!=1 and not ((file=='src/components/DomainView.tsx' and j==8 and n==2) or (file=='server.ts' and j==4 and n==2)):
   raise Exception((file,j,n,old[:150]))
  text=text.replace(old,new,1)
 changes[file]=(original,text)
final=''.join(''.join(difflib.unified_diff(a.splitlines(True),b.splitlines(True),fromfile='a/'+p,tofile='b/'+p)) for p,(a,b) in changes.items())
(job/'reconciled.patch').write_text(final);(job/'transport-repairs.json').write_text(json.dumps(repairs,indent=2))
print('Reconciled',len(changes),'files; no production writes yet')
