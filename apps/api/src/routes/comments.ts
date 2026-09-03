import { Router } from "express";
import { db } from "../db/pool";
import { getBoardName, notifyMake } from "../lib/notifyMake";
import {
  notifyMentionedUsers,
  notifyTaskCreator,
  shortenForNotification,
} from "../lib/taskNotifications";

const router = Router();


// GET COMMENTS
router.get("/task/:taskId", async (req, res) => {
  try {
    const { taskId } = req.params;

    const result = await db.query(
      `SELECT c.*, 
              u.full_name AS user_name,
              u.role AS user_role
       FROM comments c
       LEFT JOIN users u ON u.id = c.user_id
       WHERE c.task_id = $1
       ORDER BY c.created_at ASC`,
      [taskId]
    );

    return res.json({
      success: true,
      data: result.rows,
    });

  } catch (error) {
    console.error("Get comments failed:", error);

    return res.status(500).json({
      success:false,
      message:"Unable to fetch comments",
    });
  }
});



// CREATE COMMENT
router.post("/", async(req,res)=>{

 const client = await db.connect();

 try{

  const {task_id, body, mention_ids}=req.body;


  if(!task_id || !body || typeof body !== "string" || !body.trim()){

    return res.status(400).json({
      success:false,
      message:"Task and comment are required",
    });

  }


  const mentions = Array.isArray(mention_ids)
    ? [...new Set(
        mention_ids
        .map(Number)
        .filter((id:number)=>Number.isInteger(id) && id>0)
      )]
    : [];


  await client.query("BEGIN");


  const taskResult = await client.query(
    "SELECT id,title,board_id,created_by FROM tasks WHERE id=$1",
    [task_id]
  );


  const task = taskResult.rows[0];


  if(!task){

    await client.query("ROLLBACK");

    return res.status(404).json({
      success:false,
      message:"Task not found",
    });

  }



  const result = await client.query(
    `INSERT INTO comments(task_id,user_id,body)
     VALUES($1,$2,$3)
     RETURNING *`,
    [
      task_id,
      req.user!.id,
      body.trim()
    ]
  );



  // Mention notification only for NEW comments
  if(mentions.length){

    await notifyMentionedUsers(
      {
        taskId:task_id,
        actorId:req.user!.id,
        userIds:mentions,
        message:
        `{actor} mentioned you in task "${task.title}": ${shortenForNotification(body)}`
      },
      client
    );

  }



  await notifyTaskCreator(
    {
      task,
      actorId:req.user!.id,
      type:"task_comment",
      title:"New comment",
      message:
      `{actor} commented on task "${task.title}": ${shortenForNotification(body)}`,
      skipUserIds:mentions,
    },
    client
  );



  await client.query("COMMIT");


  void getBoardName(task.board_id).then((boardName)=>{

    notifyMake(
      "comment_added",
      {
        id:task.id,
        title:task.title,
        board_id:task.board_id,
        board_name:boardName
      },
      req.user!.id,
      {
        comment:body.trim()
      }
    );

  });



  return res.status(201).json({
    success:true,
    data:result.rows[0],
  });



 }catch(error){

  await client.query("ROLLBACK");

  console.error("Create comment failed:",error);

  return res.status(500).json({
    success:false,
    message:"Unable to create comment",
  });


 }finally{

  client.release();

 }

});




// EDIT COMMENT
router.patch("/:id", async(req,res)=>{

 const client = await db.connect();


 try{


  const {id}=req.params;
  const {body}=req.body;


  if(!body || typeof body !== "string" || !body.trim()){

    return res.status(400).json({
      success:false,
      message:"Comment body is required",
    });

  }



  await client.query("BEGIN");



  const commentResult = await client.query(
    `SELECT c.*,
            t.title AS task_title,
            t.created_by AS task_created_by
     FROM comments c
     JOIN tasks t ON t.id=c.task_id
     WHERE c.id=$1`,
    [id]
  );


  const comment = commentResult.rows[0];


  if(!comment){

    await client.query("ROLLBACK");

    return res.status(404).json({
      success:false,
      message:"Comment not found",
    });

  }




  if(
    Number(comment.user_id)!==req.user!.id &&
    req.user!.role!=="Manager" &&
    req.user!.role!=="Coordinator"
  ){

    await client.query("ROLLBACK");

    return res.status(403).json({
      success:false,
      message:"Not authorized to edit this comment",
    });

  }




  const result = await client.query(
    `UPDATE comments
     SET body=$1,
         updated_at=NOW()
     WHERE id=$2
     RETURNING *`,
    [
      body.trim(),
      id
    ]
  );




  // Only edit notification
  await notifyTaskCreator(
    {
      task:{
        id:comment.task_id,
        title:comment.task_title,
        created_by:comment.task_created_by,
      },

      actorId:req.user!.id,

      type:"task_comment_edited",

      title:"Comment edited",

      message:
      `{actor} edited a comment on task "${comment.task_title}": ${shortenForNotification(body)}`
    },
    client
  );



  await client.query("COMMIT");



  return res.json({
    success:true,
    data:result.rows[0],
  });



 }catch(error){

  await client.query("ROLLBACK");

  console.error("Edit comment failed:",error);


  return res.status(500).json({
    success:false,
    message:"Unable to edit comment",
  });


 }finally{

  client.release();

 }

});



export default router;