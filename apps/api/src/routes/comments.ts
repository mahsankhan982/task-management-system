import { Router } from "express";
import { db } from "../db/pool";
import { getBoardName, notifyMake } from "../lib/notifyMake";
import {
  notifyMentionedUsers,
  notifyTaskCreator,
  shortenForNotification,
} from "../lib/taskNotifications";

const router = Router();


// GET ALL TASK CONVERSATIONS WITH ONE EMPLOYEE
router.get("/conversation/:userId", async(req,res)=>{
  try{
    const selectedUserId = Number(req.params.userId);

    if(!Number.isInteger(selectedUserId) || selectedUserId <= 0){
      return res.status(400).json({ success:false, message:"Invalid employee" });
    }

    const userResult = await db.query(
      "SELECT id,full_name,email,role FROM users WHERE id=$1 AND is_active=TRUE",
      [selectedUserId]
    );

    if(!userResult.rows[0]){
      return res.status(404).json({ success:false, message:"Employee not found" });
    }

    const messagesResult = await db.query(
      `WITH employee_tasks AS (
         SELECT DISTINCT task_id
         FROM comments
         WHERE user_id=$2
       )
       SELECT c.*,
              u.full_name AS user_name,
              u.role AS user_role,
              t.title AS task_title
       FROM comments c
       JOIN employee_tasks et ON et.task_id=c.task_id
       JOIN tasks t ON t.id=c.task_id
       LEFT JOIN users u ON u.id=c.user_id
       WHERE c.user_id IN ($1,$2)
         AND NOT EXISTS (
           SELECT 1
           FROM comment_hidden_users chu
           WHERE chu.comment_id=c.id
             AND chu.user_id=$1
         )
       ORDER BY c.created_at ASC
       LIMIT 500`,
      [req.user!.id, selectedUserId]
    );

    const tasksResult = await db.query(
      `SELECT DISTINCT t.id,t.title
       FROM tasks t
       JOIN comments c ON c.task_id=t.id
       WHERE c.user_id=$1
       ORDER BY t.title`,
      [selectedUserId]
    );

    return res.json({
      success:true,
      data:messagesResult.rows,
      tasks:tasksResult.rows,
      employee:userResult.rows[0],
    });
  }catch(error){
    console.error("Get employee task conversation failed:",error);
    return res.status(500).json({
      success:false,
      message:"Unable to fetch employee conversation",
    });
  }
});


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
         AND NOT EXISTS (
           SELECT 1
           FROM comment_hidden_users chu
           WHERE chu.comment_id = c.id
             AND chu.user_id = $2
         )
       ORDER BY c.created_at ASC`,
      [taskId, req.user!.id]
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
     WHERE c.id=$1
       AND c.deleted_at IS NULL`,
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


// DELETE COMMENT FOR CURRENT USER ONLY
router.delete("/:id/me", async(req,res)=>{

 try{

  const {id}=req.params;

  const commentResult = await db.query(
    "SELECT id FROM comments WHERE id=$1",
    [id]
  );

  if(!commentResult.rows[0]){

    return res.status(404).json({
      success:false,
      message:"Comment not found",
    });

  }

  await db.query(
    `INSERT INTO comment_hidden_users(comment_id,user_id)
     VALUES($1,$2)
     ON CONFLICT(comment_id,user_id) DO NOTHING`,
    [id, req.user!.id]
  );

  return res.json({ success:true });

 }catch(error){

  console.error("Delete comment for user failed:",error);

  return res.status(500).json({
    success:false,
    message:"Unable to delete message for you",
  });

 }

});


// SOFT DELETE COMMENT
router.delete("/:id", async(req,res)=>{

 const client = await db.connect();

 try{

  const {id}=req.params;

  await client.query("BEGIN");

  const commentResult = await client.query(
    `SELECT id,user_id,deleted_at
     FROM comments
     WHERE id=$1
     FOR UPDATE`,
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

  if(Number(comment.user_id)!==req.user!.id){

    await client.query("ROLLBACK");

    return res.status(403).json({
      success:false,
      message:"You can only delete your own messages",
    });

  }

  const result = await client.query(
    `UPDATE comments
     SET deleted_at=COALESCE(deleted_at,NOW()),
         updated_at=CASE WHEN deleted_at IS NULL THEN NOW() ELSE updated_at END
     WHERE id=$1
     RETURNING *`,
    [id]
  );

  await client.query("COMMIT");

  return res.json({
    success:true,
    data:result.rows[0],
  });

 }catch(error){

  await client.query("ROLLBACK");

  console.error("Delete comment failed:",error);

  return res.status(500).json({
    success:false,
    message:"Unable to delete comment",
  });

 }finally{

  client.release();

 }

});



export default router;