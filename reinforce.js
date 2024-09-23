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


//병합을위한 체크사항

//프리즈마의 테이블이 제대로 적혔는가
//나오는 테이블 종류 :
//playerWaitingList - 개인이 소유하고있는 선수대기소 테이블
//users - 유저 정보가 들어있는 유저 테이블
//player - 선수의 정보가 정의되어있는 선수 테이블

router.patch("/reinforce/:playerId", authMiddleware, async (req, res, next) => {
  try {
    /*  강화 사전 준비  */

    //강화할 선수찾고 비용산정
    const user = req.user;

    //강화시 중복 보유선수를 소모하여 무료로 강화를 진행할지 묻는 질문
    //YES 면 보유선수 소모
    //그이외의 답은 모두 NO 처리
    const { costQ } = req.body;

    //어떤 선수를 강화할지 선택함
    const { playerId } = req.params;

    //강화 비용 산정
    const cost = 5000;

    //강화할 선수의 정보를 불러옴
    const player = await prisma.playerWaitingList.findFirst({
      where: {
        userId: user.userId,
        playerId: +playerId,
      },
    });

    if (!player) {
        return res.status(404).json({
            message:
              "요청하신 선수의 데이터가 존재하지않습니다!",
          });
    }

    const userInfo = await prisma.users.findFirst({
        where: {
            userId: user.userId
        }
    })



    //강화확률
    const reinforceRate = Math.floor(Math.random() * 100);
    //강화 성공확률 초기화
    let successRate = 0;

    //터질확률
    const reinforceBreakRate = Math.floor(Math.random() * 100);
    //터지는것에 성공(?)하는 확률 초기화
    let breakRate = 0;

    //선수의 강화수치에따른 확률 고정값 설정
    switch (player.force) {
      case 1:
        //성공확률 = 80%
        successRate = 80;
        break;
      case 2:
        successRate = 60;
        break;
      case 3:
        successRate = 50;
        break;
      case 4:
        successRate = 40;
        //터질확률 = 10%
        breakRate = 10;
        break;
      case 5:
        successRate = 25;
        breakRate = 15;
        break;
      case 6:
        successRate = 15;
        breakRate = 20;
        break;
      case 7:
        successRate = 10;
        breakRate = 25;
        break;
      case 8:
        successRate = 5;
        breakRate = 35;
        break;
      case 9:
        successRate = 1;
        breakRate = 50;
        break;
      default:
        return res.status(200).json({
            message:
              "이미 캐릭터의 강화수치가 최대입니다! (현재 강화수치 : 10)",
          });
          //최대 강화수치는 10
    }
    

    /*  강화 시작  */
    // await prisma.$transaction(async (tx) => { //트랜잭션 시작점

      //중복소유한 선수를 제물로 강화비 면제 | 그냥 재화 5천원 지불후 강화 선택 분기문
      if (costQ === "YES") {
        await prisma.PlayerWaitingList.update({
            where: {
                playerListId: player.playerListId,
            },
          data: {
            count: { decrement: 1 },
          },
        });
      } else {
        if (cost > userInfo.cash) {
            throw new Error("재화가 부족합니다!")
            // return res
            //   .status(400)
            //   .json({
            //     message:
            //       "재화가 부족합니다!",
            //   });
        }

        await prisma.users.update({
          where: {
            userId: user.userId,
          },
          data: {
            cash: { decrement: cost },
          },
        });
      }


      //[강화 실패] 만약 선수를 강화하다가 터진다면
      if (reinforceBreakRate < breakRate) {
        //초기(1강 상태)의 능력치를 가져오기위해 선수테이블에서 같은 선수의 정보를 불러옴
        const fail_player = await prisma.player.findFirst({
          where: {
            playerId: +playerId,
          },
        });

        //보유갯수가 줄어야하는데 보유한 선수의 갯수가 1개라면 보유한게없어야 하므로 데이터 자체를 삭제
        if (player.count === 1) {
          await prisma.playerWaitingList.delete({
            where: {
              playerListId: player.playerListId,
              userId: user.userId,
              playerId: +playerId,
            },
          });
        } else {
          // 보유갯수가 2개이상이면 보유갯수를 1만큼 줄이고 가져온 초기능력치를 적용
          await prisma.playerWaitingList.update({
            where: {
              playerListId: player.playerListId,
              userId: user.userId,
              playerId: +playerId,
            },
            data: {
              speed: fail_player.speed,
              goalDecisiveness: fail_player.goalDecisiveness,
              shootPower: fail_player.shootPower,
              defense: fail_player.defense,
              stamina: fail_player.stamina,
              count: { decrement: 1 },
              force: 1
            },
          });
        }

        throw new Error("강화 시도중 터졌습니다! 능력치,강화수치가 초기화됐습니다.")
        // return res.status(200).json({
        //     message: "강화 시도중 터졌습니다! 능력치,강화수치가 초기화됐습니다.",
        //   });
      }

      if (reinforceRate > successRate) {
        //[강화 실패] 터지진 않았지만 강화에는 실패하여 강화수치는 유지
        throw new Error("강화에 실패했습니다...")
        // return res.status(200).json({ message: "강화에 실패했습니다..." });
      }

      //[강화 성공] 모두 통과하여 정상 강화 진행

      // 선수 능력치 10%만큼 강화
      await prisma.PlayerWaitingList.update({
        where: {
          playerListId: player.playerListId,
          userId: user.userId,
          playerId: +playerId,
        },
        data: {
          speed: player.speed + Math.floor(player.speed * 0.1),
          goalDecisiveness:
            player.goalDecisiveness + Math.floor(player.goalDecisiveness * 0.1),
          shootPower: player.shootPower + Math.floor(player.shootPower * 0.1),
          defense: player.defense + Math.floor(player.defense * 0.1),
          stamina: player.stamina + Math.floor(player.stamina * 0.1),
          force: { increment: 1 },
        },
      });
    // }); //트랜잭션 마침

    //클라이언트에게 강화 성공한 선수의 스텟을 보여주기위해 새로 정보 불러옴
    const forcePlayer = await prisma.PlayerWaitingList.findFirst({
      where: {
        userId: user.userId,
        playerId: +playerId,
      },
      select: {
        playerId: true,
        playerName: true,
        speed: true,
        goalDecisiveness: true,
        shootPower: true,
        defense: true,
        stamina: true,
        force: true,
      },
    });

    return res.status(200).json({
      message: "강화가 성공하였습니다!",
      data: forcePlayer,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
