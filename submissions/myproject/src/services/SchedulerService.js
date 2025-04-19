// SchedulerService.js - Gestion de la planification des tâches
import config from '../config/config.js';
import logger from '../utils/logger.js';
import scheduler from '../utils/scheduler.js';
import cronParser from 'cron-parser';

class SchedulerService {
  constructor(trendSnipper) {
    this.trendSnipper = trendSnipper;
  }

  // Planifier une tâche
  scheduleTask(name, cronExpression, task, runImmediately = false) {
    return scheduler.schedule(name, cronExpression, task, runImmediately);
  }

  // Arrêter une tâche planifiée
  stopTask(name) {
    return scheduler.stop(name);
  }

  // Arrêter toutes les tâches
  stopAllTasks() {
    return scheduler.stopAll();
  }

  // Mettre à jour et afficher le prochain temps prévu pour le post
  updateNextPostTime() {
    try {
      if (config.agent.showNextPostTime) {
        const now = new Date();
        const cronExpression = this.trendSnipper.currentSchedule;
        // Utilisez cronParser.parseExpression au lieu de parseExpression
        const interval = cronParser.parseExpression(cronExpression);
        const nextTime = interval.next().toDate();
        
        this.trendSnipper.cycleStats.nextPostTime = nextTime;
        
        // Formater la date et l'heure
        const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const timeOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit' };
        
        const formattedDate = nextTime.toLocaleDateString('fr-FR', dateOptions);
        const formattedTime = nextTime.toLocaleTimeString('fr-FR', timeOptions);
        
        logger.info(`📅 Next post scheduled for: ${formattedDate} at ${formattedTime}`);
      }
    } catch (error) {
      logger.error(`Error calculating next post time: ${error.message}`);
    }
  }

  // Ajuster dynamiquement la planification en fonction de l'activité
  adjustSchedulingBasedOnActivity() {
    try {
      if (!config.scheduler.dynamic.enabled) return;
      
      logger.info('Evaluating scheduler adjustment based on activity level');
      
      // Déterminer le niveau d'activité actuel
      let newActivityLevel = 'medium';
      
      // Si nous avons assez de données pour évaluer
      if (this.trendSnipper.cycleStats.cycleTweetCounts.length >= 3) {
        const avgTweets = this.trendSnipper.cycleStats.averageTweetsPerCycle;
        
        if (avgTweets > 300) {
          newActivityLevel = 'high';
        } else if (avgTweets < 50) {
          newActivityLevel = 'low';
        }
        
        // Aussi tenir compte du taux de réussite
        const totalCycles = this.trendSnipper.cycleStats.successfulCycles + this.trendSnipper.cycleStats.failedCycles;
        if (totalCycles > 0) {
          const successRate = this.trendSnipper.cycleStats.successfulCycles / totalCycles;
          
          if (successRate < 0.3) {
            // Si le taux de réussite est bas, considérer comme activité faible
            newActivityLevel = 'low';
          }
        }
      }
      
      // Définir le nouvel horaire en fonction du niveau d'activité
      let newSchedule;
      if (newActivityLevel === 'high') {
        newSchedule = config.scheduler.dynamic.minInterval; // plus fréquent
        logger.info('High activity detected, increasing check frequency');
      } else if (newActivityLevel === 'low') {
        newSchedule = config.scheduler.dynamic.maxInterval; // moins fréquent
        logger.info('Low activity detected, decreasing check frequency');
      } else {
        newSchedule = config.scheduler.cronSchedule; // horaire par défaut
      }
      
      // Mettre à jour la planification si nécessaire
      if (newSchedule !== this.trendSnipper.currentSchedule) {
        logger.info(`Adjusting schedule from ${this.trendSnipper.currentSchedule} to ${newSchedule}`);
        
        this.trendSnipper.currentSchedule = newSchedule;
        scheduler.stop('trend-detection');
        
        if (this.trendSnipper.autoStart) {
          scheduler.schedule(
            'trend-detection', 
            newSchedule, 
            this.trendSnipper.trendDetectionService.runTrendDetectionCycle.bind(this.trendSnipper.trendDetectionService), 
            false
          );
          logger.info(`Task rescheduled with new frequency: ${newSchedule}`);
        } else {
          logger.info(`New schedule saved (${newSchedule}) but task not automatically rescheduled (auto-start disabled)`);
        }
      } else {
        logger.info(`Maintaining current schedule: ${this.trendSnipper.currentSchedule}`);
      }
      
      // Mettre à jour le niveau d'activité
      this.trendSnipper.activityLevel = newActivityLevel;
    } catch (error) {
      logger.error(`Error adjusting scheduling: ${error.message}`);
    }
  }
}

export default SchedulerService;