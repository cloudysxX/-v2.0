const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionsBitField, ChannelType } = require('discord.js');

const { CronJob } = require('cron');

const buzzk = require('buzzk');
const fs = require('fs');
const { G4F } = require("g4f");
const g4f = new G4F();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

buzzk.login(process.env.NID_AUT, process.env.NID_SES);

const serverFilePath = './servers.json';
const activationFilePath = './activation_codes.json';
const setupChannelsFilePath = './setup_channels.json';
const verifyInfoFilePath = './verifyInfo.json';
const filterInfoFilePath = './filter.json';
const gameStatusInfoFilePath = './gameStatus.json';

const JOBS_FILE = './jobs.json';

const messageLimits = new Map();
const messageLogs = new Map();


function loadJSON(filePath) {
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } else {
    return {};
  }
}

function saveJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

let jobs = loadJSON(JOBS_FILE);

function generateActivationCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    if (i > 0) code += '-';
    code += Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }
  return code;
}

function loadFilterSettings() {
  if (fs.existsSync(filterInfoFilePath)) {
    return JSON.parse(fs.readFileSync(filterInfoFilePath, 'utf-8'));
  } else {
    return {};
  }
}

function saveFilterSettings(data) {
  fs.writeFileSync(filterInfoFilePath, JSON.stringify(data, null, 2));
}

const filterSettings = loadFilterSettings();

async function checkStreams() {
  const setups = loadJSON(setupChannelsFilePath);
  const registeredServers = loadJSON(serverFilePath);

  for (const [streamerId, data] of Object.entries(setups)) {
    const lvDetail = await buzzk.live.getDetail(streamerId);
    const previousStatus = setups[streamerId]?.status || 'CLOSED';
    const messageSent = setups[streamerId]?.messageSent || false;
      
    const channelId = setups[streamerId]?.channelIDSend;

    if (lvDetail && lvDetail.status === 'OPEN') {
      if (previousStatus !== 'OPEN') {
        setups[streamerId] = {
          ...setups[streamerId],
          status: 'OPEN',
          messageSent: false
        };

        saveJSON(setupChannelsFilePath, setups);

        try {
          for (const serverId of Object.keys(registeredServers)) {
            const guild = await client.guilds.cache.get(serverId);
            if (guild) {
              const channel = await guild.channels.cache.get(channelId);
              if (channel) {
                const embed = new EmbedBuilder()
                  .setTitle(`${lvDetail.title}`)
                  .setDescription(`**${lvDetail.channel.name}**님이 라이브를 시작했어요!`)
                  .setAuthor({ name: '치지직', iconURL: 'https://nng-phinf.pstatic.net/MjAyMzEyMDZfMjAx/MDAxNzAxODI2MjM1Nzc1.mTfh4chMNRJi1eWIAyKbR8bWNXNFvYhaunImisnc-q0g.k9e2zf4umpScPEc5HocsUoXo9XJJntpduVqR2U4kvhog.PNG/%EC%B9%98%EC%A7%80%EC%A7%81.png?type=f120_120_na' })
                  .addFields({ name: '카테고리', value: `${lvDetail.category}` })
                  .setImage(lvDetail.channel.imageURL)
                  .setColor('#000000');

                const liveButton = new ButtonBuilder()
                  .setLabel('방송 보러가기')
                  .setURL(`https://chzzk.naver.com/live/${streamerId}`)
                  .setStyle(ButtonStyle.Link);

                const row = new ActionRowBuilder()
                  .addComponents(liveButton);

                await channel.send({ content: `@everyone\n\n`, embeds: [embed], components: [row] });

                setups[streamerId] = {
          	      ...setups[streamerId],
          	      status: 'OPEN',
         	      messageSent: true
        	    };

                saveJSON(setupChannelsFilePath, setups);
              }
            }
          }
        } catch (error) {
          console.error(`방송 알림을 체크하던 중에 에러가 발생했습니다:\n\n`, error);
        }
      }
    } else {
      if (previousStatus !== 'CLOSED' && !messageSent) {

        setups[streamerId] = {
          ...setups[streamerId],
          status: 'CLOSED',
          messageSent: false
        };
          
        saveJSON(setupChannelsFilePath, setups);

      } else if (messageSent) {

        setups[streamerId] = {
          ...setups[streamerId],
          status: 'CLOSED',
          messageSent: false
        };
          
        saveJSON(setupChannelsFilePath, setups);
      }
    }
    saveJSON(setupChannelsFilePath, setups);
  }
}

client.on('ready', async () => {
  console.log("I'm alive");
  client.user.setActivity('서버관리');

  setInterval(checkStreams, 10000);
    
  for (const [userId, jobData] of Object.entries(jobs)) {
    const { time, channelId, guildId } = jobData;
      
    const [hour, minute] = time.split(':').map(Number);
    const job = new CronJob(`${minute} ${hour} * * *`, () => {
      const guild = client.guilds.cache.get(guildId);
      const member = guild.members.cache.get(userId);
        
      if (!jobs[userId]) {
        console.log(`No job found for ${userId}. Skipping.`);
        return;
      }

      if (member && member.voice.channel && member.voice.channel.id === channelId) {
        try {
          member.voice.disconnect();
        } catch (error) {
          console.log("There was some error with disconnecting user: ", error);
        }
      } else {
        console.log(`${member.user.tag} is not in the voice channel.`);
      }
        
      delete jobs[userId];
      saveJSON(JOBS_FILE, jobs);
        
    }, null, true, 'Asia/Seoul');

    job.start();
      
    const job_2 = new CronJob(`${(minute + 1) % 60} ${hour + Math.floor((minute + 1) / 60)} * * *`, async () => {
      const guild = client.guilds.cache.get(guildId);
      const member = guild.members.cache.get(userId);
        
      if (!jobs[userId]) {
        console.log(`No job found for ${userId}. Skipping.`);
        return;
      }

      if (member && member.voice.channel && member.voice.channel.id === channelId) {
        try {
          member.voice.disconnect();
        } catch (error) {
          console.log("There was some error with disconnecting user: ", error);
        }
      } else {
        console.log(`${member.user.tag} is not in the voice channel.`);
      }
        
      delete jobs[userId];
      saveJSON(JOBS_FILE, jobs);
        
    }, null, true, 'Asia/Seoul');
      
    job_2.start();
      
    const job_3 = new CronJob(`${(minute + 2) % 60} ${hour + Math.floor((minute + 2) / 60)} * * *`, async () => {
      const guild = client.guilds.cache.get(guildId);
      const member = guild.members.cache.get(userId);
        
      if (!jobs[userId]) {
        console.log(`No job found for ${userId}. Skipping.`);
        return;
      }

      if (member && member.voice.channel && member.voice.channel.id === channelId) {
        try {
          member.voice.disconnect();
        } catch (error) {
          console.log("There was some error with disconnecting user: ", error);
        }
      } else {
        console.log(`${member.user.tag} is not in the voice channel.`);
      }
        
      delete jobs[userId];
      saveJSON(JOBS_FILE, jobs);
        
    }, null, true, 'Asia/Seoul');
      
    job_3.start();
  };
    
  const cronJob = new SlashCommandBuilder()
    .setName('예약')
    .setDescription('지정한 시간에 음성 채널에서 유저를 강퇴합니다.')
    .addStringOption(option =>
      option.setName('시간')
        .setDescription('강퇴할 시간 (HH:MM 형식) 시간대 대한민국/서울')
        .setRequired(true))
    .addUserOption(option =>
      option.setName('유저')
        .setDescription('강퇴할 유저')
        .setRequired(true))
    .addChannelOption(option =>
      option.setName('채널')
        .setDescription('강퇴할 음성 채널')
        .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
        .setRequired(true)
    );
    
  const cronJobCancel = new SlashCommandBuilder()
    .setName('예약취소')
    .setDescription('지정된 예약을 취소합니다.')
    .addUserOption(option =>
      option.setName('유저')
        .setDescription('철회할 유저')
        .setRequired(true));
    

  const Register = new SlashCommandBuilder()
    .setName('등록')
    .setDescription('서버를 등록합니다')
    .addStringOption(option =>
      option.setName('라이센스')
        .setDescription('활성화코드를 입력하세요')
        .setRequired(true)
    );

  const CreateCode = new SlashCommandBuilder()
    .setName('생성')
    .setDescription('활성화 코드를 생성합니다')
    .addIntegerOption(option =>
      option.setName('갯수')
        .setDescription('생성할 활성화 코드의 수')
        .setRequired(true)
    );

  const ListCodes = new SlashCommandBuilder()
    .setName('목록')
    .setDescription('모든 활성화 코드를 표시합니다');

  const ShowServers = new SlashCommandBuilder()
    .setName('서버')
    .setDescription('등록된 모든 서버를 표시합니다');

  const Install = new SlashCommandBuilder()
    .setName('설치')
    .setDescription('알림을 설정합니다')
    .addChannelOption(option =>
      option.setName('채널')
        .setDescription('알림이 될 디스코드 채널을 선택하세요')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('치지직')
        .setDescription('알림할 치지직 채널 ID를 입력하세요')
        .setRequired(true)
    );
  
  const deleteSet = new SlashCommandBuilder()
  .setName('삭제')
  .setDescription('지정된 채널에 등록된 알림을 삭제합니다')
  .addStringOption(option =>
    option.setName('치지직')
      .setDescription('알림할 삭제할 채널 ID를 입력하세요')
      .setRequired(true)
  );

  const Kick = new SlashCommandBuilder()
  .setName('추방')
  .setDescription('유저를 추방합니다')
  .addUserOption(option =>
    option.setName('유저')
      .setDescription('추방할 유저를 선택하세요')
      .setRequired(true)
  );

  const Ban = new SlashCommandBuilder()
  .setName('밴')
  .setDescription('유저를 밴합니다')
  .addUserOption(option =>
    option.setName('유저')
      .setDescription('밴을 시킬 유저를 선택하세요')
      .setRequired(true)
  )
  .addStringOption(option =>
      option.setName('사유')
        .setDescription('밴 사유를 입력하세요')
        .setRequired(true)
  );

  const purge = new SlashCommandBuilder()
  .setName('청소')
  .setDescription('메시지를 청소합니다')
  .addIntegerOption(option =>
    option.setName('갯수')
      .setDescription('청소할 메시지의 갯수를 입력하세요')
      .setMinValue(1)
      .setMaxValue(99)
      .setRequired(true)
  );

  const verify = new SlashCommandBuilder()
  .setName('인증')
  .setDescription('인증 버튼을 생성합니다')
  .addChannelOption(option =>
    option.setName('채널')
      .setDescription('인증 버튼을 보낼 채널을 설정합니다')
      .setRequired(true)
  )
  .addRoleOption(option =>
    option.setName('역할')
      .setDescription('인증 역할을 설정합니다')
      .setRequired(true)
  );

  const filter = new SlashCommandBuilder()
  .setName('필터')
  .setDescription('채팅 필터를 설정합니다')
  .addStringOption(option =>
    option.setName('기능')
      .setDescription('필터 기능을 선택하세요')
      .setRequired(true)
      .addChoices(
        { name: '비속어', value: 'cuss' },
        { name: '도배', value: 'spam' }
  ))
  .addStringOption(option =>
    option.setName('여부')
      .setDescription('ON/OFF 여부')
      .setRequired(true)
      .addChoices(
        { name: 'ON', value: 'ON' },
        { name: 'OFF', value: 'OFF' }
  ));
  
  const menuBar = new SlashCommandBuilder()
  .setName('메뉴')
  .setDescription('관리자 메뉴를 보여줍니다');

  const Game = new SlashCommandBuilder()
  .setName('게임')
  .setDescription('유저들과 즐길 수 있는 게임을 도전해보세요')
  .addStringOption(option =>
    option.setName('선택')
      .setDescription('게임을 선택하세요')
      .setRequired(true)
      .addChoices(
        { name: '라이어게임', value: 'LiarGame' }
  ));

  const forcedQuit = new SlashCommandBuilder()
  .setName('강제종료')
  .setDescription('진행중인 게임을 강제종료합니다');
    
  const userPurge = new SlashCommandBuilder()
  .setName('유저청소')
  .setDescription('특정 유저의 메시지를 삭제합니다')
  .addUserOption(option =>
    option.setName('유저')
      .setDescription('유저를 선택하세요')
      .setRequired(true)
  )
  .addIntegerOption(option =>
    option.setName('갯수')
      .setDescription('갯수만큼의 메시지를 삭제합니다')
      .setMinValue(1)
      .setMaxValue(99)
      .setRequired(true)
  );
    
  const timeoutUser = new SlashCommandBuilder()
  .setName('타임아웃')
  .setDescription('유저의 채팅을 임시차단합니다')
  .addUserOption(option =>
    option.setName('유저')
      .setDescription('유저를 선택하세요')
      .setRequired(true)
  )
  .addStringOption(option =>
    option.setName('시간')
      .setDescription('시간을 선택하세요')
      .addChoices(
        { name: '1분', value: '1m' },
        { name: '5분', value: '5m' },
        { name: '10분', value: '10m' },
        { name: '30분', value: '30m' },
        { name: '1시간', value: '1h' }
      )
      .setRequired(true)
  );
    
  const chatGPT = new SlashCommandBuilder()
  .setName('채팅')
  .setDescription('GPT-4o 모델과 채팅해보세요')
  .addStringOption(option =>
    option.setName('내용')
      .setDescription('채팅할 내용을 입력하세요')
      .setRequired(true)
  );
    
  client.application.commands.create(cronJob);
  client.application.commands.create(cronJobCancel);
  client.application.commands.create(Register);
  client.application.commands.create(CreateCode);
  client.application.commands.create(ListCodes);
  client.application.commands.create(ShowServers);
  client.application.commands.create(Install);
  client.application.commands.create(deleteSet);
  client.application.commands.create(Kick);
  client.application.commands.create(Ban);
  client.application.commands.create(purge);
  client.application.commands.create(userPurge);
  client.application.commands.create(verify);
  client.application.commands.create(filter);
  client.application.commands.create(menuBar);
  client.application.commands.create(Game);
  client.application.commands.create(forcedQuit);
  client.application.commands.create(timeoutUser);
  client.application.commands.create(chatGPT);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
    
  const userId = interaction.user.id;
    
  if (interaction.commandName === '예약취소') {
      
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: '**이 명령어를 사용할 권한이 없습니다.**', ephemeral: true });
    }
      
    const user = interaction.options.getUser('유저');
      
    if (jobs[user.id]) {
      delete jobs[user.id];
      saveJSON(JOBS_FILE, jobs);
      await interaction.reply(`**${user.tag}님의 예약이 철회되었습니다.**`);
    } else {
      await interaction.reply(`**${user.tag}님의 예약이 없습니다.**`);
    }
  };
    
  if (interaction.commandName === '예약') {
    const time = interaction.options.getString('시간');
    const user = interaction.options.getUser('유저');
    const channel = interaction.options.getChannel('채널');
      
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: '**이 명령어를 사용할 권한이 없습니다.**', ephemeral: true });
    }
      
    if (!time || !user || !channel) {
      return interaction.reply({ content: '**모든 정보를 입력해 주세요.**', ephemeral: true });
    }
      
    const [hour, minute] = time.split(':').map(Number);

    if (isNaN(hour) || isNaN(minute)) {
      return interaction.reply({ content: '**시간 형식이 올바르지 않습니다. HH:MM 형식으로 입력해 주세요.**', ephemeral: true });
    }
      
    jobs[user.id] = {
      time,
      channelId: channel.id,
      guildId: interaction.guild.id
    };

    saveJSON(JOBS_FILE, jobs);

    const job = new CronJob(`${minute} ${hour} * * *`, () => {
      const guild = interaction.guild;
      const member = guild.members.cache.get(user.id);
        
      if (!jobs[user.id]) {
        console.log(`No job found for ${user.id}. Skipping.`);
        return;
      }

      if (member && member.voice.channel && member.voice.channel.id === channel.id) {
        member.voice.disconnect();
        interaction.followUp(`**${user.tag}님을 ${channel.name}에서 강퇴했습니다.**`);
      } else {
        interaction.followUp(`**${user.tag}님은 ${channel.name}에 없습니다.**`);
      }

      delete jobs[user.id];
      saveJSON(JOBS_FILE, jobs);
    }, null, true, 'Asia/Seoul');

    job.start();
      
    jobs[user.id] = {
      time,
      channelId: channel.id,
      guildId: interaction.guild.id
    };

    saveJSON(JOBS_FILE, jobs);
      
    const job_2 = new CronJob(`${(minute + 1) % 60} ${hour + Math.floor((minute + 1) / 60)} * * *`, async () => {
      const guild = interaction.guild;
      const member = guild.members.cache.get(user.id);
        
      if (!jobs[user.id]) {
        console.log(`No job found for ${user.id}. Skipping.`);
        return;
      }

      if (member && member.voice.channel && member.voice.channel.id === channel.id) {
        member.voice.disconnect();
        interaction.followUp(`**${user.tag}님을 ${channel.name}에서 강퇴했습니다.**`);
      } else {
        interaction.followUp(`**${user.tag}님은 ${channel.name}에 없습니다.**`);
      }

      delete jobs[user.id];
      saveJSON(JOBS_FILE, jobs);
    }, null, true, 'Asia/Seoul');

    job_2.start();
      
    jobs[user.id] = {
      time,
      channelId: channel.id,
      guildId: interaction.guild.id
    };

    saveJSON(JOBS_FILE, jobs);
      
    const job_3 = new CronJob(`${(minute + 2) % 60} ${hour + Math.floor((minute + 2) / 60)} * * *`, async () => {
      const guild = interaction.guild;
      const member = guild.members.cache.get(user.id);
        
      if (!jobs[user.id]) {
        console.log(`No job found for ${user.id}. Skipping.`);
        return;
      }

      if (member && member.voice.channel && member.voice.channel.id === channel.id) {
        member.voice.disconnect();
        interaction.followUp(`**${user.tag}님을 ${channel.name}에서 강퇴했습니다.**`);
      } else {
        interaction.followUp(`**${user.tag}님은 ${channel.name}에 없습니다.**`);
      }

      delete jobs[user.id];
      saveJSON(JOBS_FILE, jobs);
    }, null, true, 'Asia/Seoul');

    job_3.start();
      
    jobs[user.id] = {
      time,
      channelId: channel.id,
      guildId: interaction.guild.id
    };

    saveJSON(JOBS_FILE, jobs);

    await interaction.reply(`**${time}에 ${user.tag}님을 ${channel.name}에서 강퇴하도록 예약했습니다.**`);
  }
    
  if (interaction.commandName === '채팅') {
    if (userId !== '734339724734496840' && userId !== '1263890162493030543') {
      return interaction.reply({ content: '**이 명령어를 사용할 권한이 없습니다.**', ephemeral: true });
    }

    const messageToChat = interaction.options.getString('내용');
    const messages = [
      { role: "system", content: "너는 유저의 숙제를 도와주는 챗봇이야, 풀이도 같이 해줘야해. 존댓말을 사용하고, 한국어로만 답해야해."},
      { role: "user", content: messageToChat }
    ];

    try {
      await interaction.deferReply();
      const response = await g4f.chatCompletion(messages);
      await interaction.editReply(response);
    } catch (error) {
      console.error(error);
      await interaction.editReply({ content: '**봇이 응답하는데에 있어서 에러가 발생하였습니다**', ephemeral: true });
    }
  }
    
  if (interaction.commandName === '타임아웃') {
    const serverId = interaction.guild.id;
    const registeredServers = loadJSON(serverFilePath);

    if (!registeredServers[serverId]) {
      return interaction.reply({ content: '**먼저 서버를 등록해주세요.**', ephemeral: true });
    }

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: '**이 명령어를 사용할 권한이 없습니다.**', ephemeral: true });
    }
      
    const selectedUser = interaction.options.getMember('유저');
    const timeoutDuration = interaction.options.getString('시간');
      
    try {
      if (timeoutDuration === '1m') {
        await selectedUser.timeout(60000);
        await interaction.reply({ content: `**<@${selectedUser.id}>님이 1분동안 타임아웃 되었습니다.**`, ephemeral: true });
      }
      if (timeoutDuration === '5m') {
        await selectedUser.timeout(300000);
        await interaction.reply({ content: `**<@${selectedUser.id}>님이 5분동안 타임아웃 되었습니다.**`, ephemeral: true });
      }
      if (timeoutDuration === '10m') {
        await selectedUser.timeout(600000);
        await interaction.reply({ content: `**<@${selectedUser.id}>님이 10분동안 타임아웃 되었습니다.**`, ephemeral: true });
      }
      if (timeoutDuration === '30m') {
        await selectedUser.timeout(1800000);
        await interaction.reply({ content: `**<@${selectedUser.id}>님이 30분동안 타임아웃 되었습니다.**`, ephemeral: true });
      }
      if (timeoutDuration === '1h') {
        await selectedUser.timeout(3600000);
        await interaction.reply({ content: `**<@${selectedUser.id}>님이 1시간동안 타임아웃 되었습니다.**`, ephemeral: true });
      }
    } catch (error) {
      console.error('유저를 타임하는 중에 에러발생: ', error);
      await interaction.reply(`**권한이 부족하여 유저를 타임아웃하지 못했습니다.**`);
    }
  }
    
  if (interaction.commandName === '유저청소') {
    const serverId = interaction.guild.id;
    const registeredServers = loadJSON(serverFilePath);

    if (!registeredServers[serverId]) {
      return interaction.reply({ content: '**먼저 서버를 등록해주세요.**', ephemeral: true });
    }

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
      return interaction.reply({ content: '**이 명령어를 사용할 권한이 없습니다.**', ephemeral: true });
    }
      
    async function fetchUserMessages(channel, userId, amount) {
      let messages = [];
      let lastId = null;

      while (messages.length < amount) {
        const options = { limit: 100 };
        if (lastId) {
          options.before = lastId;
        }

        const fetched = await channel.messages.fetch(options);
        if (fetched.size === 0) {
          break;
        }
          
        const userMessages = fetched.filter(msg => msg.author.id === userId).map(msg => msg);
        messages = messages.concat(userMessages);
        lastId = fetched.last().id;

        if (messages.length >= amount) {
          break;
        }
      }

      return messages.slice(0, amount);
    }

    const selectedUser = interaction.options.getMember('유저');
    const amount = interaction.options.getInteger('갯수');

    if (amount < 1 || amount > 99) {
      return interaction.reply({ content: '**메시지 갯수는 1에서 99 사이여야 합니다.**', ephemeral: true });
    }
      
    await interaction.deferReply({ ephemeral: true });

    try {
       
      const userMessages = await fetchUserMessages(interaction.channel, selectedUser.id, amount);

      if (userMessages.length === 0) {
        return interaction.reply({ content: '**해당 유저의 메시지를 찾을 수 없습니다.**', ephemeral: true });
      }

      await interaction.channel.bulkDelete(userMessages, true);
      await interaction.editReply({ content: `**${userMessages.length}개의 <@${selectedUser.id}>님의 메시지가 삭제되었습니다.**` });
    } catch (error) {
      console.error('메시지 삭제 중 오류 발생:', error);
      await interaction.editReply({ content: '**권한이 부족하여 메시지를 삭제할 수 없습니다.**' });
    }
  }

  if (interaction.commandName === '등록') {
    const code = interaction.options.getString('라이센스');
    const serverId = interaction.guild.id;

    const activationCodes = loadJSON(activationFilePath);
    const registeredServers = loadJSON(serverFilePath);

    if (activationCodes[code] && !registeredServers[serverId]) {
      registeredServers[serverId] = {
        registeredAt: new Date().toISOString()
      };

      delete activationCodes[code];

      saveJSON(serverFilePath, registeredServers);
      saveJSON(activationFilePath, activationCodes);

      await interaction.reply({ content: '**서버가 성공적으로 등록되었습니다!**', ephemeral: true });
    } else if (!activationCodes[code]) {
      await interaction.reply({ content: '**잘못된 활성화 코드입니다.**', ephemeral: true });
    } else if (registeredServers[serverId]) {
      await interaction.reply({ content: '**이 서버는 이미 등록되었습니다.**', ephemeral: true });
    }
  }

  if (interaction.commandName === '생성') {
    if (userId !== '734339724734496840') {
      return interaction.reply({ content: '**이 명령어를 사용할 권한이 없습니다.**', ephemeral: true });
    };

    const count = interaction.options.getInteger('갯수');

    if (count === 0) {
      return interaction.reply({ content: '**활성화 코드는 1개 이상 생성해야 합니다.**', ephemeral: true });
    };
    
    const activationCodes = loadJSON(activationFilePath);

    let generatedCodes = [];

    for (let i = 0; i < count; i++) {
      let newCode = generateActivationCode();
      while (activationCodes[newCode]) {
        newCode = generateActivationCode();
      }
      activationCodes[newCode] = {
        createdAt: new Date().toISOString(),
      };
      generatedCodes.push(newCode);
    }

    saveJSON(activationFilePath, activationCodes);

    await interaction.reply({ content: `**생성된 활성화 코드**:\n${generatedCodes.join('\n')}`, ephemeral: true });
  }

  if (interaction.commandName === '목록') {
    if (userId !== '734339724734496840') {
      return interaction.reply({ content: '**이 명령어를 사용할 권한이 없습니다.**', ephemeral: true });
    };

    const serverId = interaction.guild.id;
    
    const activationCodes = loadJSON(activationFilePath);
    const codesList = Object.keys(activationCodes).join('\n');
    
    if (codesList) {
      await interaction.reply({ content: `**활성화 코드 목록:**\n\n${codesList}`, ephemeral: true });
    } else {
      await interaction.reply({ content: '**현재 활성화 코드가 없습니다.**', ephemeral: true });
    }
  }

  if (interaction.commandName === '서버') {
    if (userId !== '734339724734496840') {
      return interaction.reply({ content: '**이 명령어를 사용할 권한이 없습니다.**', ephemeral: true });
    };

    const registeredServers = loadJSON(serverFilePath);
    const serversList = Object.keys(registeredServers).join('\n');

    if (serversList) {
        await interaction.reply({ content: `**등록된 서버 목록:**\n\n${serversList}`, ephemeral: true });
      } else {
        await interaction.reply({ content: '**현재 등록된 서버가 없습니다.**', ephemeral: true });
      }
    }
  
  if (interaction.commandName === '설치') {
    return interaction.reply({ content: '**현재는 사용할 수 없는 명령어입니다.**', ephemeral: true });
    /*const serverId = interaction.guild.id;
    const registeredServers = loadJSON(serverFilePath);

    if (!registeredServers[serverId]) {
      return interaction.reply({ content: '**먼저 서버를 등록해주세요.**', ephemeral: true });
    }

    const channelId = interaction.options.getChannel('채널').id;
    const streamerId = interaction.options.getString('치지직');
    
    const setups = loadJSON(setupChannelsFilePath);

    setups[streamerId] = {
      channelIDSend: channelId,
      status: 'CLOSED',
      messageSent: false
    };
      
    saveJSON(setupChannelsFilePath, setups);

    await interaction.reply({ content: `**알림이 설정되었습니다!**\n\n디스코드 채널: <#${channelId}>\n치지직 채널 ID: ${streamerId}`, ephemeral: true });
    */
  }

  if (interaction.commandName === '삭제') {
    return interaction.reply({ content: '**현재는 사용할 수 없는 명령어입니다.**', ephemeral: true });
    /*
    const streamId = interaction.options.getString('치지직');

    const setups = loadJSON(setupChannelsFilePath);
      
    if (setups[streamId]) {
      await interaction.reply({ content: `**알림이 삭제되었습니다!**\n\n치지직: ${streamId}`, ephemeral: true });
        
      delete setups[streamId];
      saveJSON(setupChannelsFilePath, setups);
        
    } else {
        
      await interaction.reply({ content: '**지정된 치지직 채널에 대한 알림이 없습니다.**', ephemeral: true });
    }
    */
  }
  
  if (interaction.commandName === '추방') {
    const serverId = interaction.guild.id;
    const registeredServers = loadJSON(serverFilePath);

    if (!registeredServers[serverId]) {
      return interaction.reply({ content: '**먼저 서버를 등록해주세요.**', ephemeral: true });
    }
    
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
      return interaction.reply({ content: '**이 명령어를 사용할 권한이 없습니다.**', ephemeral: true });
    }

    const member = interaction.options.getMember('유저');
    
    if (!member) {
      return interaction.reply({ content: '**지정된 유저를 찾을 수 없습니다.**', ephemeral: true });
    }

    if (!member.kickable) {
      return interaction.reply({ content: '**이 유저를 추방할 수 없습니다.**', ephemeral: true });
    }

    try {
      await member.kick('추방 됐습니다');
      await interaction.reply({ content: `**${member.user.tag}**님을 추방했습니다.`, ephemeral: true });
    } catch (error) {
      console.error('추방 중 오류 발생:', error);
      await interaction.reply({ content: '**유저를 추방하는 중 오류가 발생했습니다.**', ephemeral: true });
    }
  }

  if (interaction.commandName === '밴') {
    const serverId = interaction.guild.id;
    const registeredServers = loadJSON(serverFilePath);

    if (!registeredServers[serverId]) {
      return interaction.reply({ content: '**먼저 서버를 등록해주세요.**', ephemeral: true });
    }
    
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
      return interaction.reply({ content: '**이 명령어를 사용할 권한이 없습니다.**', ephemeral: true });
    }

    const member = interaction.options.getMember('유저');
    const reason = interaction.options.getString('사유');

    if (!member) {
      return interaction.reply({ content: '**지정된 유저를 찾을 수 없습니다.**', ephemeral: true });
    }

    if (!member.bannable) {
      return interaction.reply({ content: '**이 유저를 밴할 수 없습니다.**', ephemeral: true });
    }

    try {
      await member.ban({ reason: reason });
      await interaction.reply({ content: `**${member.user.tag}**님을 밴했습니다.\n\n**사유:** ${reason}`, ephemeral: true });
    } catch (error) {
      console.error('밴 중 오류 발생:', error);
      await interaction.reply({ content: '**유저를 밴하는 중 오류가 발생했습니다.**', ephemeral: true });
    }
  }
  
  if (interaction.commandName === '청소') {
    const serverId = interaction.guild.id;
    const registeredServers = loadJSON(serverFilePath);

    if (!registeredServers[serverId]) {
      return interaction.reply({ content: '**먼저 서버를 등록해주세요.**', ephemeral: true });
    }
    
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
      return interaction.reply({ content: '**이 명령어를 사용할 권한이 없습니다.**', ephemeral: true });
    }

    const amount = interaction.options.getInteger('갯수');

    if (amount < 1 || amount > 99) {
      return interaction.reply({ content: '**메시지 갯수는 1에서 99 사이여야 합니다.**', ephemeral: true });
    }

    try {
      const messages = await interaction.channel.bulkDelete(amount, true);
      await interaction.reply({ content: `**${messages.size}개의 메시지가 삭제되었습니다.**`, ephemeral: true });
    } catch (error) {
      console.error('메시지 삭제 중 오류 발생:', error);
      await interaction.reply({ content: '**메시지 삭제 중 오류가 발생했습니다.**', ephemeral: true });
    }
  }
	
  if (interaction.commandName === '인증') {
    const serverId = interaction.guild.id;
    const registeredServers = loadJSON(serverFilePath);

    if (!registeredServers[serverId]) {
      return interaction.reply({ content: '**먼저 서버를 등록해주세요.**', ephemeral: true });
    }
    
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: '**이 명령어를 사용할 권한이 없습니다.**', ephemeral: true });
    }

    const channel = interaction.options.getChannel('채널');
    const role = interaction.options.getRole('역할');

    const verifyInfoData = loadJSON(verifyInfoFilePath);
      verifyInfoData[serverId] = {
        channelId: channel.id,
        roleId: role.id,
      };
      saveJSON(verifyInfoFilePath, verifyInfoData);
    

    const Button = new ButtonBuilder()
      .setCustomId('verifyButton')
      .setEmoji('✅')
      .setLabel('인증하기')
      .setStyle(ButtonStyle.Success);

    const verify = new ActionRowBuilder()
      .addComponents(Button);

    const embed = new EmbedBuilder()
      .setColor('#000000')
      .setTitle('인증메뉴')
      .setDescription('서버 이용을 위해 인증해주세요');

    await channel.send({ embeds: [embed], components: [verify] });
    await interaction.reply({ content: '**성공적으로 인증메시지를 전송하였습니다!**', ephemeral: true });
  }
	
  if (interaction.commandName === '필터') {
    const serverId = interaction.guild.id;
    const registeredServers = loadJSON(serverFilePath);

    if (!registeredServers[serverId]) {
      return interaction.reply({ content: '**먼저 서버를 등록해주세요.**', ephemeral: true });
    }
  
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: '**이 명령어를 사용할 권한이 없습니다.**', ephemeral: true });
    }
  
    const filterType = interaction.options.getString('기능');
    const status = interaction.options.getString('여부') === 'ON';

    if (filterType === 'spam') {
      if (filterSettings[serverId]?.spamFilter === status) {
        return interaction.reply({ content: '**도배 필터는 이미 설정되어 있습니다.**', ephemeral: true });
      }
	    
      filterSettings[serverId] = {
        ...filterSettings[serverId],
        spamFilter: status,
      };
	    
      saveFilterSettings(filterSettings);
    
      if (status) {
        await interaction.reply({ content: '**도배 필터가 활성화되었습니다.**', ephemeral: true });
      } else {
        await interaction.reply({ content: '**도배 필터가 비활성화되었습니다.**', ephemeral: true });
      }
    }

    if (filterType === 'cuss') {
      if (filterSettings[serverId]?.cussFilter === status) {
        return interaction.reply({ content: '**비속어 필터는 이미 설정되어 있습니다.**', ephemeral: true });
      }
	    
      filterSettings[serverId] = {
        ...filterSettings[serverId],
        cussFilter: status,
      };
	    
      saveFilterSettings(filterSettings);
    
      if (status) {
        await interaction.reply({ content: '**비속어 필터가 활성화되었습니다.**', ephemeral: true });
      } else {
        await interaction.reply({ content: '**비속어 필터가 비활성화되었습니다.**', ephemeral: true });
      }
    }
  }

  if (interaction.commandName === '메뉴') {
    if (userId !== '734339724734496840') {
      return interaction.reply({ content: '**이 명령어를 사용할 권한이 없습니다.**', ephemeral: true });
    };

    const embed = new EmbedBuilder()
      .setColor('#000000')
      .setTitle('관리자 메뉴')
      .setDescription('원하시는 기능을 선택해주세요');

    const webhook = new ButtonBuilder()
      .setCustomId('webhookButton')
      .setEmoji('🔗')
      .setLabel('웹후크')
      .setStyle(ButtonStyle.Secondary);

    const sendWebhook = new ButtonBuilder()
      .setCustomId('sendWebhookButton')
      .setEmoji('🚀')
      .setLabel('전송하기')
      .setStyle(ButtonStyle.Success);

    const createWebhook = new ButtonBuilder()
      .setCustomId('createWebhookButton')
      .setEmoji('🛠️')
      .setLabel('생성하기')
      .setStyle(ButtonStyle.Danger);

    const deleteWebhook = new ButtonBuilder()
      .setCustomId('deleteWebhookButton')
      .setEmoji('📦')
      .setLabel('삭제하기')
      .setStyle(ButtonStyle.Primary);

    const Bar = new ActionRowBuilder()
      .addComponents(webhook, sendWebhook, createWebhook, deleteWebhook);

    await interaction.reply({ embeds: [embed], components: [Bar], ephemeral: true });
  }

  if (interaction.commandName === '강제종료') {
	  
    const guildID = interaction.guild.id;
    const guild = await client.guilds.cache.get(guildID);
	  
    const gameStatusJSON = loadJSON(gameStatusInfoFilePath);
    const gameStatus = gameStatusJSON[guildID]?.status || 'CLOSED';

    const host = gameStatusJSON[guildID]?.host || null;

    if (userId === '734339724734496840' || userId === host || interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
	    
      if (gameStatus !== 'CLOSED') {
	    
        const channelID = gameStatusJSON[guildID]?.channelID || null;
        const channel = await guild.channels.cache.get(channelID);

        const messageID = gameStatusJSON[guildID]?.messageID || null;

        try {
	      
          const sentMessage = await channel.messages.fetch(messageID);
          await sentMessage.delete();

          gameStatusJSON[guildID] = {
            status: 'CLOSED',
            host: null,
            players: [],
            messageID: null,
            channelID: null,
            guildID: null,
            sentTopic: false,
            firstDay: false,
            secondDay: false,
            thirdDay: false
	  }

          saveJSON(gameStatusInfoFilePath, gameStatusJSON);

          await interaction.reply({ content: '**성공적으로 진행중인 게임을 강제종료 했습니다!**', ephemeral: true });
	      
        } catch (error) {

          console.error('강제종료 하던 중에 에러가 발생하여, 강제로 상태만 변경하였습니다');
	      
          gameStatusJSON[guildID] = {
            status: 'CLOSED',
            host: null,
            players: [],
            messageID: null,
            channelID: null,
            guildID: null,
            sentTopic: false,
            firstDay: false,
            secondDay: false,
            thirdDay: false
	  }

          saveJSON(gameStatusInfoFilePath, gameStatusJSON);

          await interaction.reply({ content: '**성공적으로 진행중인 게임을 강제종료 했습니다!**', ephemeral: true });
        }
	    
      } else {
	    
        await interaction.reply({ content: '**현재 진행중인 게임이 없습니다**', ephemeral: true });
      }
	    
    } else {
	    
      await interaction.reply({ content: '**주최자나 봇 관리자만 이 명령어를 사용할 수 있습니다**', ephemeral: true });
	    
    }
  }
	
  if (interaction.commandName === '게임') {
    const guildID = interaction.guild.id;
	  
    const gameStatusJSON = loadJSON(gameStatusInfoFilePath);
    const gameStatus = gameStatusJSON[guildID]?.status || 'CLOSED';
      
    const selectedGame = interaction.options.getString('선택');
      
    const registeredServers = loadJSON(serverFilePath);

    if (!registeredServers[guildID]) {
      return interaction.reply({ content: '**먼저 서버를 등록해주세요.**', ephemeral: true });
    }
      
    if (selectedGame === 'LiarGame') {

      if (gameStatus !== 'CLOSED') {
        return interaction.reply({ content: '**현재 진행중인 게임이 이미 있습니다**', ephemeral: true });
      };

      const embed = new EmbedBuilder()
        .setColor('#000000')
        .setTitle('주최자 메뉴')
        .setDescription('당신은 **주최자**입니다. 게임을 진행하세요!');

      const firstDay = new ButtonBuilder()
        .setCustomId('firstDayButton')
        .setLabel('1일차')
        .setStyle(ButtonStyle.Secondary);

      const secondDay = new ButtonBuilder()
        .setCustomId('secondDayButton')
        .setLabel('2일차')
        .setStyle(ButtonStyle.Secondary);

      const thirdDay = new ButtonBuilder()
        .setCustomId('thirdDayButton')
        .setLabel('3일차')
        .setStyle(ButtonStyle.Secondary);

      const discuss = new ButtonBuilder()
       .setCustomId('discussButton')
        .setLabel('토론')
        .setStyle(ButtonStyle.Primary);

      const keyword = new ButtonBuilder()
        .setCustomId('keywordButton')
        .setLabel('제시어')
        .setStyle(ButtonStyle.Success);

      const quit = new ButtonBuilder()
        .setCustomId('quitButton')
        .setLabel('종료')
        .setStyle(ButtonStyle.Danger);

      const Bar = new ActionRowBuilder()
        .addComponents(firstDay, secondDay, thirdDay, discuss, keyword);
	  

	  
      const joinEmbed = new EmbedBuilder()
        .setColor('#000000')
        .setTitle('라이어게임')
        .setDescription('참가인원: 0/8');

      const join = new ButtonBuilder()
        .setCustomId('joinButton')
        .setLabel('참가')
        .setStyle(ButtonStyle.Primary);

      const start = new ButtonBuilder()
        .setCustomId('startButton')
        .setLabel('시작')
        .setStyle(ButtonStyle.Success);

      const joinMenuBar = new ActionRowBuilder()
        .addComponents(join, start, quit);

      const needToDeleteAfterButtonPress = await interaction.reply({ embeds: [embed], components: [Bar], ephemeral: true });
      const needToEditAfterButtonPress = await interaction.channel.send({ embeds: [joinEmbed], components: [joinMenuBar] });

      gameStatusJSON[guildID] = {
        status: 'OPEN',
        host: interaction.user.id,
        players: [],
        messageID: needToEditAfterButtonPress.id,
        channelID: interaction.channel.id,
        guildID: interaction.guild.id,
        sentTopic: false,
        firstDay: false,
        secondDay: false,
        thirdDay: false
      };

      saveJSON(gameStatusInfoFilePath, gameStatusJSON);
    }
  }
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isButton()) {

    if (interaction.customId === 'discussButton') {
      const gameStatusJSON = loadJSON(gameStatusInfoFilePath);
	    
      const guildID = interaction.guild.id;

      const host = gameStatusJSON[guildID]?.host || null;
      const gameStatus = gameStatusJSON[guildID]?.status || 'CLOSED';
      const sentTopic = gameStatusJSON[guildID]?.sentTopic || false;

      if (interaction.user.id !== host) {
        return interaction.reply({ content: '**주최자만 이 버튼을 사용할 수 있습니다**', ephemeral: true });
      }

      if (gameStatus !== 'InGame') {
        return interaction.reply({ content: '**게임을 먼저 시작해주세요**', ephemeral: true });
      }

      if (sentTopic !== true) {
        return interaction.reply({ content: '**그전에 먼저 제시어를 보내주시기 바랍니다**', ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setColor('#14B724')
        .setTitle('토론')
        .setDescription(`**모두 누가 라이어인거 같으신지 토론해주시기 바랍니다**`);

      await interaction.channel.send({ embeds: [embed] });
      await interaction.reply({ content: '**성공적으로 토론 알림을 전송하였습니다**', ephemeral: true });
    }
	  
    if (interaction.customId === 'firstDayButton') {
      const gameStatusJSON = loadJSON(gameStatusInfoFilePath);
	    
      const guildID = interaction.guild.id;

      const host = gameStatusJSON[guildID]?.host || null;
      const gameStatus = gameStatusJSON[guildID]?.status || 'CLOSED';
      const firstDay = gameStatusJSON[guildID]?.firstDay || false;
      const sentTopic = gameStatusJSON[guildID]?.sentTopic || false;

      if (interaction.user.id !== host) {
        return interaction.reply({ content: '**주최자만 이 버튼을 사용할 수 있습니다**', ephemeral: true });
      }

      if (gameStatus !== 'InGame') {
        return interaction.reply({ content: '**게임을 먼저 시작해주세요**', ephemeral: true });
      }

      if (firstDay !== false) {
        return interaction.reply({ content: '**1일차 알림을 이미 전송하셨습니다**', ephemeral: true });
      }

      if (sentTopic !== true) {
        return interaction.reply({ content: '**그전에 먼저 제시어를 보내주시기 바랍니다**', ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setColor('#000000')
        .setTitle('1일차')
        .setDescription(`**모두 제시어를 차례대로 설명해주세요**`);

      await interaction.channel.send({ embeds: [embed] });
      await interaction.reply({ content: '**성공적으로 1일차 알림을 전송하였습니다**', ephemeral: true });

      gameStatusJSON[guildID] = {
        ...gameStatusJSON[guildID],
        firstDay: true
      };

      saveJSON(gameStatusInfoFilePath, gameStatusJSON);
    }

    if (interaction.customId === 'secondDayButton') {
      const gameStatusJSON = loadJSON(gameStatusInfoFilePath);
	    
      const guildID = interaction.guild.id;

      const host = gameStatusJSON[guildID]?.host || null;
      const gameStatus = gameStatusJSON[guildID]?.status || 'CLOSED';
      const firstDay = gameStatusJSON[guildID]?.firstDay || false;
      const secondDay = gameStatusJSON[guildID]?.secondDay || false;
      const sentTopic = gameStatusJSON[guildID]?.sentTopic || false;

      if (interaction.user.id !== host) {
        return interaction.reply({ content: '**주최자만 이 버튼을 사용할 수 있습니다**', ephemeral: true });
      }

      if (gameStatus !== 'InGame') {
        return interaction.reply({ content: '**게임을 먼저 시작해주세요**', ephemeral: true });
      }

      if (secondDay !== false) {
        return interaction.reply({ content: '**2일차 알림을 이미 전송하셨습니다**', ephemeral: true });
      }

      if (firstDay !== true) {
        return interaction.reply({ content: '**그전에 먼저 1일차 알림을 보내주시기 바랍니다**', ephemeral: true });
      }

      if (sentTopic !== true) {
        return interaction.reply({ content: '**그전에 먼저 제시어를 보내주시기 바랍니다**', ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setColor('#000000')
        .setTitle('2일차')
        .setDescription(`**모두 제시어를 차례대로 설명해주세요**`);

      await interaction.channel.send({ embeds: [embed] });
      await interaction.reply({ content: '**성공적으로 2일차 알림을 전송하였습니다**', ephemeral: true });

      gameStatusJSON[guildID] = {
        ...gameStatusJSON[guildID],
        secondDay: true
      };

      saveJSON(gameStatusInfoFilePath, gameStatusJSON);
    }

    if (interaction.customId === 'thirdDayButton') {
      const gameStatusJSON = loadJSON(gameStatusInfoFilePath);
	    
      const guildID = interaction.guild.id;

      const host = gameStatusJSON[guildID]?.host || null;
      const gameStatus = gameStatusJSON[guildID]?.status || 'CLOSED';
      const firstDay = gameStatusJSON[guildID]?.firstDay || false;
      const secondDay = gameStatusJSON[guildID]?.secondDay || false;
      const thirdDay = gameStatusJSON[guildID]?.thirdDay || false;
      const sentTopic = gameStatusJSON[guildID]?.sentTopic || false;

      if (interaction.user.id !== host) {
        return interaction.reply({ content: '**주최자만 이 버튼을 사용할 수 있습니다**', ephemeral: true });
      }

      if (gameStatus !== 'InGame') {
        return interaction.reply({ content: '**게임을 먼저 시작해주세요**', ephemeral: true });
      }

      if (thirdDay !== false) {
        return interaction.reply({ content: '**3일차 알림을 이미 전송하셨습니다**', ephemeral: true });
      }

      if (firstDay !== true || secondDay !== true) {
        return interaction.reply({ content: '**그전에 먼저 1일차, 2일차 알림을 보내주시기 바랍니다**', ephemeral: true });
      }

      if (sentTopic !== true) {
        return interaction.reply({ content: '**그전에 먼저 제시어를 보내주시기 바랍니다**', ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setColor('#000000')
        .setTitle('3일차')
        .setDescription(`**모두 제시어를 차례대로 설명해주세요**`);

      await interaction.channel.send({ embeds: [embed] });
      await interaction.reply({ content: '**성공적으로 3일차 알림을 전송하였습니다**', ephemeral: true });

      gameStatusJSON[guildID] = {
        ...gameStatusJSON[guildID],
        thirdDay: true
      };

      saveJSON(gameStatusInfoFilePath, gameStatusJSON);
    }
	  
    if (interaction.customId === 'joinButton') {
      const guildID = interaction.guild.id;
      const gameStatusJSON = loadJSON(gameStatusInfoFilePath);

      const guild = await client.guilds.cache.get(guildID);

      const channelID = gameStatusJSON[guildID]?.channelID;
      const channelToMessage = await guild.channels.cache.get(channelID);
	    
      const messageID = gameStatusJSON[guildID]?.messageID;

      const host = gameStatusJSON[guildID]?.host || null;
      const gameStatus = gameStatusJSON[guildID]?.status || 'CLOSED';
      const players = gameStatusJSON[guildID]?.players || [];

      if (players.length === 8) {
        return interaction.reply({ content: '**인원이 꽉찼습니다. 다시 시도해주세요**', ephemeral: true });
      }

      if (interaction.user.id === host) {
        return interaction.reply({ content: '**주최자는 참여할 수 없습니다**', ephemeral: true });
      }

      if (gameStatus === 'InGame') {
        return interaction.reply({ content: '**게임이 이미 시작됐습니다. 다시 시도해주세요**', ephemeral: true });
      }
	    
      for (const player of players) {
        if (interaction.user.id === player) {
          return interaction.reply({ content: '**이미 참가하셨습니다!**', ephemeral: true });
        }
      }

      gameStatusJSON[guildID]?.players.push(interaction.user.id);
      saveJSON(gameStatusInfoFilePath, gameStatusJSON);

      const joinEmbed = new EmbedBuilder()
        .setColor('#000000')
        .setTitle('라이어게임')
        .setDescription(`참가인원: ${players.length}/8`);

      const join = new ButtonBuilder()
        .setCustomId('joinButton')
        .setLabel('참가')
        .setStyle(ButtonStyle.Primary);

      const start = new ButtonBuilder()
        .setCustomId('startButton')
        .setLabel('시작')
        .setStyle(ButtonStyle.Success);

      const quit = new ButtonBuilder()
        .setCustomId('quitButton')
        .setLabel('종료')
        .setStyle(ButtonStyle.Danger);

      const joinMenuBar = new ActionRowBuilder()
        .addComponents(join, start, quit);

      const sentMessage = await channelToMessage.messages.fetch(messageID);
	    
      const edittedSentMessage = await sentMessage.edit({ embeds: [joinEmbed], components: [joinMenuBar] });
      await interaction.reply({ content: '**성공적으로 참여되셨습니다!**', ephemeral: true });

      gameStatusJSON[guildID] = {
        ...gameStatusJSON[guildID],
        messageID: edittedSentMessage.id
      };

      saveJSON(gameStatusInfoFilePath, gameStatusJSON);
    }

    if (interaction.customId === 'startButton') {
      const guildID = interaction.guild.id;
      const gameStatusJSON = loadJSON(gameStatusInfoFilePath);

      const guild = await client.guilds.cache.get(guildID);

      const channelID = gameStatusJSON[guildID]?.channelID;
      const channelToMessage = await guild.channels.cache.get(channelID);
	    
      const messageID = gameStatusJSON[guildID]?.messageID;

      const gameStatus = gameStatusJSON[guildID]?.status || 'CLOSED';
      const players = gameStatusJSON[guildID]?.players || [];
      const host = gameStatusJSON[guildID]?.host || null;

      if (interaction.user.id !== host) {
        return interaction.reply({ content: '**주최자만 게임을 시작할 수 있습니다**', ephemeral: true });
      }

      if (players.length < 4) {
        return interaction.reply({ content: '**4명 이상 플레이어가 있어야 시작할 수 있습니다**', ephemeral: true });
      }

      if (gameStatus === 'CLOSED' || gameStatus === 'InGame') {
        return interaction.reply({ content: '**게임이 이미 시작됐거나, 진행중이 아닙니다**', ephemeral: true });
      }

      gameStatusJSON[guildID] = {
        ...gameStatusJSON[guildID],
        status: 'InGame'
      };

      const sentMessage = await channelToMessage.messages.fetch(messageID);
	    
      await interaction.channel.send('**라이어게임이 시작됐습니다!**\n\n> /게임 명령어를 사용하신 분이 **주최자**가 됩니다\n\n> **라이어** 한명을 제외한 모든 사람에게 DM으로 **제시어**가 전달됩니다.\n\n> **라이어**는 랜덤으로 배정되며 DM으로 **라이어**임이 전달됩니다.\n\n> 이후 1일차가 시작됩니다. 참가인원이 차례대로 번갈아가며 **제시어**를 **라이어**가 눈치채지 못하게 문장형으로 설명합니다. (예: 맛있는게 많아요)\n\n> **라이어**는 **제시어**를 설명할 차례가 올때 최대한 **시민**인척 연기하며 설명합니다.\n\n> N일차마다 제시어 설명이 끝난 후 **토론**을 시작합니다. (예: 1번님이 라이어에요 왜냐하면.. ~~~).\n\n> 3일차가 종료되고 **라이어**를 잡아내는 **투표**를 시작하게 됩니다.\n\n> **투표**에서 라이어로 당선 된 사람이 **라이어**라면 라이어에게 정답을 맞출 기회룰 줍니다.\n\n>    > 라이어가 **정답**을 맞춘다면 **라이어**의 승리\n>    > 라이어가 **오답**을 낸다면 **시민**의 승리\n\n> **투표**에서 라이어로 당선 된 사람이 **시민**이라면 **라이어**의 승리입니다.\n\n> 투표방식은 채널에서 투표해주시면 됩니다\n\n\n\n**주최자의 진행을 기다립니다...**');
      await sentMessage.delete();
	    
      saveJSON(gameStatusInfoFilePath, gameStatusJSON);
    }
	  
    if (interaction.customId === 'quitButton') {
      const guildID = interaction.guild.id;
      const gameStatusJSON = loadJSON(gameStatusInfoFilePath);

      const guild = await client.guilds.cache.get(guildID);

      const channelID = gameStatusJSON[guildID]?.channelID || null;
      const channelToMessage = await guild.channels.cache.get(channelID);
	    
      const messageID = gameStatusJSON[guildID]?.messageID || null;

      const host = gameStatusJSON[guildID]?.host

      if (interaction.user.id === host) {
        gameStatusJSON[guildID] = {
          status: 'CLOSED',
          host: null,
          players: [],
          messageID: null,
          channelID: null,
          guildID: null,
          sentTopic: false,
          firstDay: false,
          secondDay: false,
          thirdDay: false
	}
        gameStatusJSON[guildID]?.players.push(interaction.user.id);
        saveJSON(gameStatusInfoFilePath, gameStatusJSON);

        const sentMessage = await channelToMessage.messages.fetch(messageID);
	    
        await interaction.reply({ content: '**성공적으로 게임을 종료했습니다**', ephemeral: true });
        await sentMessage.delete();
      } else {
        await interaction.reply({ content: '**주최자만 게임을 종료할 수 있습니다**', ephemeral: true });
      }
    }
	  
    if (interaction.customId === 'verifyButton') {
      const serverId = interaction.guild.id;
      const verifyInfoData = loadJSON(verifyInfoFilePath);
      const roleId = verifyInfoData[serverId]?.roleId;

      if (!roleId) {
        return interaction.reply({ content: '**역할이 설정되어 있지 않습니다**', ephemeral: true });
      }

      const role = interaction.guild.roles.cache.get(roleId);

      if (!role) {
        return interaction.reply({ content: '**역할을 찾을 수 없습니다.**', ephemeral: true });
      }

      if (interaction.member.roles.cache.has(role.id)) {
        return interaction.reply({ content: '**이미 인증된 상태입니다.**', ephemeral: true });
      }

      try {
        await interaction.member.roles.add(role);
        await interaction.reply({ content: '**성공적으로 인증되었습니다!**', ephemeral: true });
      } catch (error) {
        console.error('역할 부여 중 오류 발생:', error);
        await interaction.reply({ content: '**역할을 부여하는 중 오류가 발생했습니다.**', ephemeral: true });
      }
    }

    if (interaction.customId === 'webhookButton') {
      const Modal = new ModalBuilder()
        .setCustomId('webhookModal')
        .setTitle('웹후크 가져오기');

      const guildID = new TextInputBuilder()
        .setCustomId('guildIDInput')
        .setLabel('서버 ID')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('1263893472117522473')
        .setRequired(true);

      const channelID = new TextInputBuilder()
        .setCustomId('channelIDInput')
        .setLabel('채널 ID')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('1264189242616315964')
        .setRequired(true);

      const guildIDActionRow = new ActionRowBuilder().addComponents(guildID);
      const channelIDActionRow = new ActionRowBuilder().addComponents(channelID);

      Modal.addComponents(guildIDActionRow, channelIDActionRow);

      await interaction.showModal(Modal);
    }

    if (interaction.customId === 'sendWebhookButton') {
      const Modal = new ModalBuilder()
        .setCustomId('sendWebhookModal')
        .setTitle('전송하기');

      const webhookURL = new TextInputBuilder()
        .setCustomId('webhookURLInput')
        .setLabel('웹후크')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('https://discord.com/api/webhooks/1282654303076618240/ExampleWebhook')
        .setRequired(true);

      const name = new TextInputBuilder()
        .setCustomId('nameInput')
        .setLabel('이름')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('홍길동')
        .setRequired(true);

      const imageURL = new TextInputBuilder()
        .setCustomId('imageURLInput')
        .setLabel('이미지')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('https://cdn.discordapp.com/attachments/1279358749462495263/example.png')
        .setRequired(true);

      const amountToSend = new TextInputBuilder()
        .setCustomId('amountToSendInput')
        .setLabel('횟수')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('100')
        .setRequired(true);

      const messageToSend = new TextInputBuilder()
        .setCustomId('messageToSendInput')
        .setLabel('메시지')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const webhookURLActionRow = new ActionRowBuilder().addComponents(webhookURL);
      const nameActionRow = new ActionRowBuilder().addComponents(name);
      const imageURLActionRow = new ActionRowBuilder().addComponents(imageURL);
      const messageToSendActionRow = new ActionRowBuilder().addComponents(messageToSend);
      const amountToSendActionRow = new ActionRowBuilder().addComponents(amountToSend);

      Modal.addComponents(nameActionRow, imageURLActionRow, webhookURLActionRow, amountToSendActionRow, messageToSendActionRow);

      await interaction.showModal(Modal);
    }
    if (interaction.customId === 'createWebhookButton') {
      const Modal = new ModalBuilder()
        .setCustomId('createWebhookModal')
        .setTitle('생성하기');

      const guildID = new TextInputBuilder()
        .setCustomId('guildIDInput')
        .setLabel('서버 ID')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('1263893472117522473')
        .setRequired(true);

      const channelID = new TextInputBuilder()
        .setCustomId('channelIDInput')
        .setLabel('채널 ID')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('1264188692835205120')
        .setRequired(true);

      const guildIDActionRow = new ActionRowBuilder().addComponents(guildID);
      const channelIDActionRow = new ActionRowBuilder().addComponents(channelID);

      Modal.addComponents(guildIDActionRow, channelIDActionRow);

      await interaction.showModal(Modal);
    }
    if (interaction.customId === 'deleteWebhookButton') {
      const Modal = new ModalBuilder()
        .setCustomId('deleteWebhookModal')
        .setTitle('삭제하기');

      const guildID = new TextInputBuilder()
        .setCustomId('guildIDInput')
        .setLabel('서버 ID')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('1263893472117522473')
        .setRequired(true);

      const channelID = new TextInputBuilder()
        .setCustomId('channelIDInput')
        .setLabel('채널 ID')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('1264188692835205120')
        .setRequired(true);

      const webhookID = new TextInputBuilder()
        .setCustomId('webhookIDInput')
        .setLabel('웹후크 ID')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('1282726258458759290')
        .setRequired(true);

      const guildIDActionRow = new ActionRowBuilder().addComponents(guildID);
      const channelIDActionRow = new ActionRowBuilder().addComponents(channelID);
      const webhookIDActionRow = new ActionRowBuilder().addComponents(webhookID);

      Modal.addComponents(guildIDActionRow, channelIDActionRow, webhookIDActionRow);

      await interaction.showModal(Modal);
    }

    if (interaction.customId === 'keywordButton') {
      const guildID = interaction.guild.id

      const gameStatusJSON = loadJSON(gameStatusInfoFilePath);
      const host = gameStatusJSON[guildID]?.host || null;

      if (interaction.user.id !== host) {
        return interaction.reply({ content: '**주최자만 이 버튼을 사용할 수 있습니다**', ephemeral: true });
      }
	    
      const Modal = new ModalBuilder()
        .setCustomId('keywordModal')
        .setTitle('제시어');

      const keywordInput = new TextInputBuilder()
        .setCustomId('keywordInput')
        .setLabel('제시어')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('비행기')
        .setRequired(true);

      const keywordActionRow = new ActionRowBuilder().addComponents(keywordInput);

      Modal.addComponents(keywordActionRow);

      await interaction.showModal(Modal);
    }
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'webhookModal') {
      const guildID = await interaction.fields.getTextInputValue('guildIDInput');
      const channelID = await interaction.fields.getTextInputValue('channelIDInput');

      try {
        const guild = await client.guilds.cache.get(guildID);
        if (!guild) return interaction.reply({ content: '**해당 서버를 찾을 수 없습니다**', ephemeral: true });

        const channel = await guild.channels.cache.get(channelID);
        if (!channel) return interaction.reply({ content: '**해당 채널을 찾을 수 없습니다**', ephemeral: true });

        const webhooks = await channel.fetchWebhooks();
        if (webhooks.size === 0) return interaction.reply({ content: '**해당 채널에 웹후크가 없습니다**', ephemeral: true });

	const webhookToSend = webhooks.first().url;
	await interaction.reply({ content: `**웹후크 URL: ${webhookToSend}**`, ephemeral: true });

      } catch (error) {

        console.error('웹후크를 불러오는 중에 오류 발생:', error);
        await interaction.reply({ content: '**웹후크를 불러오는 중에 문제가 발생했습니다**', ephemeral: true });

      }
    }
    if (interaction.customId === 'sendWebhookModal') {
      const webhookURL = await interaction.fields.getTextInputValue('webhookURLInput');
      const imageURL = await interaction.fields.getTextInputValue('imageURLInput');
      const name = await interaction.fields.getTextInputValue('nameInput');
      const amountToSend = await interaction.fields.getTextInputValue('amountToSendInput');
      const messageToSend = await interaction.fields.getTextInputValue('messageToSendInput');

      const senders = Array.from({ length: Number(amountToSend) }, (_, i) => ({
        username: name,
        avatar_url: imageURL
      }));

      async function sendMessage(sender, message) {
        try {
          console.log('전송 대기중');
          const data = {
            username: sender.username,
            avatar_url: sender.avatar_url,
            content: message
          };

          fetch(webhookURL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
          })
          .then(response => {
            if (response.ok) {
              console.log('Webhook sent successfully!');
            } else {
              console.error('Failed to send webhook:', response.status, response.statusText);
            }
          })
          .catch(error => {
            console.error('Error sending webhook:', error);
          });
            
          await interaction.reply({ content: '**웹후크를 성공적으로 전송하였습니다!**', ephemeral: true });

        } catch (error) {
          console.error(`Failed to send message from ${name}: ${error}`);

          console.log('Message sent:', error.response.status);
          console.log('Rate limit remaining:', error.response.headers['x-ratelimit-remaining']);
          console.log('Rate limit reset after:', error.response.headers['x-ratelimit-reset-after']);
        }
      }

      async function sendMessagesWithoutLimit() {
        const message = messageToSend;

        const promises = senders.map(sender =>
          sendMessage(sender, message)
        );

        await Promise.all(promises);
      }

      try {
        
        sendMessagesWithoutLimit()

      } catch (error) {

        console.error('웹후크를 전송하는 중에 오류 발생:', error);
        await interaction.reply({ content: '**웹후크를 전송하는 중에 문제가 발생했습니다**', ephemeral: true });

      }
    }
    if (interaction.customId === 'createWebhookModal') {
      const guildID = await interaction.fields.getTextInputValue('guildIDInput');
      const channelID = await interaction.fields.getTextInputValue('channelIDInput');

      try {
        const guild = await client.guilds.cache.get(guildID);
        if (!guild) return interaction.reply({ content: '**해당 서버를 찾을 수 없습니다**', ephemeral: true });

        const channel = await guild.channels.cache.get(channelID);
        if (!channel) return interaction.reply({ content: '**해당 채널을 찾을 수 없습니다**', ephemeral: true });

        const createdWebhook = await channel.createWebhook({
          name: '치지직 방송알림 웹후크',
          avatar: 'https://nng-phinf.pstatic.net/MjAyMzEyMDZfMjAx/MDAxNzAxODI2MjM1Nzc1.mTfh4chMNRJi1eWIAyKbR8bWNXNFvYhaunImisnc-q0g.k9e2zf4umpScPEc5HocsUoXo9XJJntpduVqR2U4kvhog.PNG/%EC%B9%98%EC%A7%80%EC%A7%81.png?type=f120_120_na',
	});

        await interaction.reply({ content: `**웹후크 URL: ${createdWebhook.url}**`, ephemeral: true });

      } catch (error) {

        console.error('웹후크를 생성하는 중에 오류 발생:', error);
        await interaction.reply({ content: '**웹후크를 생성하는 중에 문제가 발생했습니다**', ephemeral: true });

      }
    }
    if (interaction.customId === 'deleteWebhookModal') {
      const guildID = await interaction.fields.getTextInputValue('guildIDInput');
      const channelID = await interaction.fields.getTextInputValue('channelIDInput');
      const webhookID = await interaction.fields.getTextInputValue('webhookIDInput');

      try {
        const guild = await client.guilds.cache.get(guildID);
        if (!guild) return interaction.reply({ content: '**해당 서버를 찾을 수 없습니다**', ephemeral: true });

        const channel = await guild.channels.cache.get(channelID);
        if (!channel) return interaction.reply({ content: '**해당 채널을 찾을 수 없습니다**', ephemeral: true });

        const deleteWebhook = await channel.fetchWebhooks();
        const webhook = deleteWebhook.get(webhookID);

        await webhook.delete();
	await interaction.reply({ content: '**성공적으로 웹후크를 삭제했습니다!**', ephemeral: true });

      } catch (error) {

        console.error('웹후크를 삭제하는 중에 오류 발생:', error);
        await interaction.reply({ content: '**웹후크를 삭제하는 중에 문제가 발생했습니다**', ephemeral: true });

      }
    }
    if (interaction.customId === 'keywordModal') {
      const guildID = interaction.guild.id;

      const keywordInput = await interaction.fields.getTextInputValue('keywordInput');
      const gameStatusJSON = loadJSON(gameStatusInfoFilePath);
	    
      const gameStatus = gameStatusJSON[guildID]?.status || 'CLOSED';
      const sentTopic = gameStatusJSON[guildID]?.sentTopic || false;
      const players = gameStatusJSON[guildID]?.players || [];

      if (gameStatus !== 'InGame') {
        return interaction.reply({ content: '**게임을 먼저 시작해주세요**', ephemeral: true });
      }

      if (sentTopic !== false) {
        return interaction.reply({ content: '**이미 제시어를 전송하셨습니다**', ephemeral: true });
      }

      const sentMessages = [];

      try {
        const liarIndex = Math.floor(Math.random() * players.length);
        const liarID = players[liarIndex];

        for (const player of players) {
          const user = await client.users.fetch(player);
          let dmMessage;

          if (player === liarID) {
            const embed = new EmbedBuilder()
              .setColor('#FF0000')
              .setTitle('라이어')
              .setDescription('당신은 **라이어**입니다. 시민들을 속여 이겨보세요!');
        
            dmMessage = await user.send({ embeds: [embed] });
          } else {

            const embed = new EmbedBuilder()
              .setColor('#14B724')
              .setTitle('시민')
              .setDescription(`당신은 **시민**입니다. 제시어는 **${keywordInput}**입니다.`);
        
            dmMessage = await user.send({ embeds: [embed] });
          }

          sentMessages.push({ user, dmMessage });
        }

        await interaction.reply({ content: '**성공적으로 참가자들에게 제시어를 전송했습니다!**', ephemeral: true });

        gameStatusJSON[guildID] = {
          ...gameStatusJSON[guildID],
          sentTopic: true
        };

        saveJSON(gameStatusInfoFilePath, gameStatusJSON);

      } catch (error) {
        console.error('제시어를 전송하는 중에 오류 발생:', error);
	      
        if (sentMessages.length > 0) {
          for (const { user, dmMessage } of sentMessages) {
            try {
              await dmMessage.delete();
                
              await interaction.reply({ content: '**참가자중에 DM을 막아두신 분이 있어 오류가 발생했습니다. 이미 전송된 제시어들은 삭제했습니다.**', ephemeral: true });
            } catch (deleteError) {
              console.error(`유저 ${user.tag}에게 보낸 메시지를 삭제하는 중 오류 발생:`, deleteError);
            }
          }
	    }

        gameStatusJSON[guildID] = {
          ...gameStatusJSON[guildID],
          sentTopic: false
        };

        saveJSON(gameStatusInfoFilePath, gameStatusJSON);
      }
    }
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
    
  if (message.content === '음') {
    await message.channel.send('음');
  };
    
  if (message.content === '흠') {
    await message.channel.send('흠');
  };
    
  if (message.author.bot && !message.webhookId) return;
  if (!message.webhookId && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

  const serverId = message.guild.id;
  
  if (filterSettings[serverId]?.spamFilter) {

    const userId = message.webhookId ? message.webhookId : message.author.id;
    const currentTime = Date.now();
	  
    if (message.content.length > 48) {
      try {
      	await message.delete();
        if (!message.webhookId) {
      	  await message.member.timeout(600 * 1000, '**도배 필터가 켜져있어 타임아웃되었습니다.**');
        }
      	console.log('**사용자가 성공적으로 타임아웃되었습니다.**');
	      
      } catch (error) {
      	await message.delete();
      	await message.channel.send('**권한 부족으로 인해 유저를 타임아웃하지 못했습니다.**');
      }
    }

    if (!messageLogs.has(userId)) {
      messageLogs.set(userId, []);
    }

    const logs = messageLogs.get(userId);
    logs.push({ content: message.content, timestamp: currentTime, message: message });

    if (logs.length > 16) {
      logs.shift();
    }

    const timestamps = logs.map(log => log.timestamp);
    const filteredTimestamps = timestamps.filter(timestamp => currentTime - timestamp < 1150);

    if (filteredTimestamps.length > 3) {
      for (const log of logs) {
        try {
          await log.message.delete();
          if (!message.webhookId) {
            await message.member.timeout(600 * 1000, '**도배 필터가 켜져있어 타임아웃되었습니다.**');
          }
        } catch (error) {
          console.error(`Failed to delete message: ${error}`);
        }
      }

      try {
        await messageLogs.delete(userId);
        if (!message.webhookId) {
          await message.member.timeout(600 * 1000, '**도배 필터가 켜져있어 타임아웃되었습니다.**');
        }
        console.log('**사용자가 성공적으로 타임아웃되었습니다.**');
      } catch (error) {
        await messageLogs.delete(userId);
        await message.channel.send('**권한 부족으로 인해 유저를 타임아웃하지 못했습니다.**');
      }
    }
  }

  if (filterSettings[serverId]?.cussFilter) {
    const foundWord = badWords.some(word => message.content.toLowerCase().includes(word));
    
    if (foundWord) {
      try {
        await message.delete();
        if (!message.webhookId) {
          await message.member.timeout(600 * 1000, '**도배 필터가 켜져있어 타임아웃되었습니다.**');
        }
      } catch (error) {
        await message.channel.send('**권한 부족으로 인해 유저를 타임아웃하지 못했습니다.**');
        await message.delete();
      }
    }
  }
});

client.login(process.env.TOKEN);
