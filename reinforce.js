import express from "express";
import authMiddleware from "../middlewares/auth.middleware.js";
import { prisma } from "../utils/prisma/index.js";

const router = express.Router();

// 강화기능

// 비용 :
//     1. 강화비용은 기본 5천원
//     1-1. 강화단계에따라 비용은 점점 증가
//     2. 보유숫자가 2개이상일시 보유숫자를 줄여서 강화비용은 무료로 진행 가능

// 강화내용 :
//     1. 강화시 능력치 10%씩 복리로 강화

// 강화실패 :
//     1. 3강까지는 실패시 유지
//     2. 4강부터는 실패시 유지하지만 터지는확률도 생긴다

router.patch('/reinforce/:playerId', authMiddleware ,async (req, res, next) => {
    try{
        //강화할 선수찾고 비용산정
        const user = req.user;

        //강화시 중복 보유선수를 소모하여 무료로 강화를 진행할지 묻는 질문
        //YES 면 보유선수 소모
        //그이외의 답은 모두 NO 처리
        const costQ = req.body

        const cost = 5000;

        const {playerId} = req.params

        console.log(playerId)
        
        const player = await prisma.playerWaitingList.findFirst({
          where : {
            userId : user.userId,
            playerId : +playerId
          }
        });

        //강화 시작

        const reinforceRate = Math.floor(Math.random() * 100)
        let successRate = 0;

        const reinforceBreakRate = Math.floor(Math.random() * 100)
        let breakRate = 0;

        console.log(reinforceRate, reinforceBreakRate)

        switch (player.force) {
            case 1 :
                successRate = 80
                break;
            case 2 :
                successRate = 60
                break;
            case 3 :
                successRate = 50
                break;
            case 4 :
                successRate = 40
                breakRate = 10
                break;
            case 5 :
                successRate = 25
                breakRate = 15
                break;
            case 6 :
                successRate = 15
                breakRate = 20
                break;
            case 7 :
                successRate = 10
                breakRate = 25
                break;
            case 8 :
                successRate = 5
                breakRate = 35
                break;
            case 9 :
                successRate = 1
                breakRate = 50
                break;
            default :
                return res.status(200).json({ message: "이미 캐릭터의 강화수치가 최대입니다! (현재 강화수치 : 10)"});
        }

        if(reinforceBreakRate < breakRate) {
            //장비가 터짐
            const fail_player = await prisma.player.findFirst({
                where : {
                  playerId: +playerId
                }
              });

            if(player.count === 1) {
                // 보유갯수가 1개면 데이터 삭제
                await prisma.playerWaitingList.delete({
                    where : {
                      playerListId: player.playerListId,
                      userId : user.userId,
                      playerId: +playerId
                    }
                });
            }
            else {
                // 보유갯수가 2개이상이면 갯수줄이고 능력치 초기화
            await prisma.playerWaitingList.update({
                where : {
                  playerListId: player.playerListId,
                  userId : user.userId,
                  playerId: +playerId
                },
                data : {
                    speed : fail_player.speed,
                    goalDecisiveness : fail_player.goalDecisiveness,
                    shootPower : fail_player.shootPower,
                    defense : fail_player.defense,
                    stamina : fail_player.stamina,
                    count :  { decrement: 1 }
                }
            });
            }


            return res.status(200).json({ message: "강화 시도중 터졌습니다! 능력치,강화수치가 초기화됐습니다."});
        }

        if(reinforceRate > successRate) {
            //강화 실패
            return res.status(200).json({ message: "강화에 실패했습니다..."});
        }



        //모두 성공하여 정상 강화 진행
        await prisma.$transaction(async (tx) => {
            // 트랜잭션 내부에서 유저 재화 감소 업데이트
            if(costQ === "YES") {
            await tx.PlayerWaitingList.update({
              data: {
                count: { decrement: 1 },
              },
            });
            }
            else {
            await tx.users.update({
              where: {
                userId: user.userId,
              },
              data: {
                cash: { decrement: cost },
              },
            });
            }
    
            // 트랜잭션 내부에서 선수 능력치 10%만큼 강화
            await tx.PlayerWaitingList.update({
              where: {
                playerListId: player.playerListId,
                userId: user.userId,
                playerId: +playerId
              },
              data: {
                speed : player.speed + Math.floor(player.speed * 0.1),
                goalDecisiveness : player.goalDecisiveness + Math.floor(player.goalDecisiveness * 0.1),
                shootPower : player.shootPower + Math.floor(player.shootPower * 0.1),
                defense : player.defense + Math.floor(player.defense * 0.1),
                stamina : player.stamina + Math.floor(player.stamina * 0.1),
                force : { increment: 1 }
              }
            });
          });
        
          const forcePlayer = await prisma.PlayerWaitingList.findFirst({
            where : {
                userId:user.userId,
                playerId: +playerId
            },
            select : {
                playerId: true,
                playerName: true,
                speed:true,
                goalDecisiveness:true,
                shootPower:true,
                defense:true,
                stamina:true,
                force:true
            }
          });

    
        return res.status(201).json({ 
            message: "강화가 성공하였습니다!",
            data : forcePlayer
        });
    } catch (error) {
      next(error);
    }
    });


export default router;