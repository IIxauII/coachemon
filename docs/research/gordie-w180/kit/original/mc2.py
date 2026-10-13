import random
# engine max-roll % of target max HP (sand up), from getAttackDamage
SE_T = {0:{'Reshiram':115.6,'Leavanny':150.7,'Gyarados':138,'Golbat':175.3,'Snorlax':56.4},
        -1:{'Reshiram':77.3,'Leavanny':100.8,'Gyarados':92.4,'Golbat':117.2,'Snorlax':37.7},
        -2:{'Reshiram':58.2,'Leavanny':75.9,'Gyarados':69.4,'Golbat':88.2,'Snorlax':28.4}}
CR_T = {0:{'Reshiram':46.3,'Leavanny':60.4,'Gyarados':55.3,'Golbat':70.2,'Snorlax':45.1}}
OURS = {'Leavanny':('Bug Bite',38.0,1.0,True),'Reshiram':('Dragon Pulse',37.8,1.0,False),
        'Gyarados':('Hydro Pump',35.9,0.8,True),'Golbat':('Toxic',0,1.0,False),'Snorlax':('Body Slam',18.1,1.0,False)}
LEFTOVERS = {'Reshiram':2/16}
def roll(m): return m*random.randint(85,100)/100
def sim(lineup, use_bugbite=True):
    ty=100.0; berries={'Sitrus','Enigma','Lansat','Ganlon','Leppa'}; tox=0; atk=0; sePP=5
    q=list(lineup)
    while q:
        name,hp=q.pop(0)
        if name=='Gyarados': atk=max(-6,atk-1)  # Intimidate on entry
        while hp>0:
            mv,dmg,acc,se=OURS[name]
            # we're faster than Tyranitar (all four)
            if name=='Golbat':
                if tox==0: tox=1
                else: ty-=roll(6.2)  # Venoshock on poisoned ~2x ->12.4; keep tiny
            elif random.random()<acc:
                ty-=roll(dmg)
                if se and 'Enigma' in berries and ty>0: ty+=25; berries.discard('Enigma')
                if name=='Leavanny' and berries:
                    b=random.choice(sorted(berries)); berries.discard(b)
            if ty>0 and ty<=50 and 'Sitrus' in berries: ty+=25; berries.discard('Sitrus')
            if ty<=0: return True
            # Tyranitar attacks
            if sePP==0 and 'Leppa' in berries: sePP=5; berries.discard('Leppa')
            if sePP>0:
                sePP-=1
                if random.random()<0.8: hp-=roll(SE_T[max(atk,-2)][name])
            else:
                hp-=roll(CR_T[0][name]*(2/(2-atk) if atk<0 else 1))
            # end of turn
            if hp>0: hp-=6.25; hp+=100*LEFTOVERS.get(name,0)
            if tox: ty-=6.25*tox; tox+=1
            if ty<=0: return True
    return False
N=40000
lines={
 'HUD line (Golbat spent as fodder): Leavanny53, Reshiram42, Gyarados32':[('Leavanny',53),('Reshiram',42),('Gyarados',32)],
 'Golbat kept, Gyarados spent: Golbat, Leavanny53, Reshiram42':[('Golbat',100),('Leavanny',53),('Reshiram',42)],
 'Golbat kept, Leavanny spent: Golbat, Gyarados32, Reshiram42':[('Golbat',100),('Gyarados',32),('Reshiram',42)],
 'Golbat+Gyarados kept, Leavanny spent: Golbat, Gyarados32, Reshiram42 (Leavanny gone)':[('Golbat',100),('Gyarados',32),('Reshiram',42)],
 'Golbat+Gyarados+Leavanny kept: Golbat, Leavanny53, Gyarados32, Reshiram42':[('Golbat',100),('Leavanny',53),('Gyarados',32),('Reshiram',42)],
 'Golbat+Gyarados kept, Reshiram gone: Golbat, Leavanny53, Gyarados32':[('Golbat',100),('Leavanny',53),('Gyarados',32)],
}
for k,v in lines.items():
    w=sum(sim(v) for _ in range(N))/N
    print(f'{w*100:5.1f}%  {k}')
