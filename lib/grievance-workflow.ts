import { supabase } from './supabase';
import { GrievanceNotificationService } from './grievance-notifications';

export interface WorkflowRule {
  id: string;
  name: string;
  conditions: {
    category?: string[];
    grievanceType?: string[];
    priority?: string[];
    urgency?: string[];
    keywords?: string[];
    timeOpen?: number; // hours
    studentType?: string[];
  };
  actions: {
    autoAssign?: string; // admin user ID
    setPriority?: string;
    setUrgency?: string;
    addTags?: string[];
    sendNotification?: string;
    escalate?: boolean;
    escalateTo?: string[];
    requireApproval?: boolean;
    customScript?: string;
  };
  isActive: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowTransition {
  from: string[];
  to: string;
  conditions?: {
    role?: string[];
    permissions?: string[];
    approval?: boolean;
    customValidation?: string;
  };
  actions?: {
    notification?: string[];
    updateFields?: Record<string, any>;
    runScript?: string;
  };
}

export interface GrievanceState {
  id: string;
  grievanceId: string;
  currentStatus: string;
  previousStatus?: string;
  assignedTo?: string;
  escalatedTo?: string;
  slaDeadline?: string;
  escalationDeadline?: string;
  workflowStage: string;
  metadata: Record<string, any>;
  lastTransitionAt: string;
  createdAt: string;
  updatedAt: string;
}

// Predefined workflow stages
const WORKFLOW_STAGES = {
  SUBMITTED: 'submitted',
  TRIAGED: 'triaged',
  ASSIGNED: 'assigned',
  INVESTIGATING: 'investigating',
  PENDING_APPROVAL: 'pending_approval',
  IMPLEMENTING: 'implementing',
  RESOLVED: 'resolved',
  CLOSED: 'closed',
  ESCALATED: 'escalated'
};

// Allowed status transitions
const STATUS_TRANSITIONS: Record<string, WorkflowTransition> = {
  'open_to_in_progress': {
    from: ['open'],
    to: 'in_progress',
    conditions: {
      role: ['super_admin', 'operations_admin'],
      approval: false
    },
    actions: {
      notification: ['student', 'assigned_admin'],
      updateFields: { workflow_stage: WORKFLOW_STAGES.ASSIGNED }
    }
  },
  'in_progress_to_resolved': {
    from: ['in_progress'],
    to: 'resolved',
    conditions: {
      role: ['super_admin', 'operations_admin'],
      approval: false
    },
    actions: {
      notification: ['student', 'supervisor'],
      updateFields: { 
        workflow_stage: WORKFLOW_STAGES.RESOLVED,
        resolved_at: new Date().toISOString()
      }
    }
  },
  'resolved_to_closed': {
    from: ['resolved'],
    to: 'closed',
    conditions: {
      role: ['super_admin', 'operations_admin'],
      approval: false
    },
    actions: {
      notification: ['student'],
      updateFields: { workflow_stage: WORKFLOW_STAGES.CLOSED }
    }
  },
  'any_to_escalated': {
    from: ['open', 'in_progress'],
    to: 'escalated',
    conditions: {
      role: ['super_admin', 'operations_admin'],
      approval: true
    },
    actions: {
      notification: ['escalation_team', 'student'],
      updateFields: { 
        workflow_stage: WORKFLOW_STAGES.ESCALATED,
        escalated_at: new Date().toISOString()
      }
    }
  }
};

export class GrievanceWorkflowManager {
  
  /**
   * Initialize workflow for a new grievance
   */
  static async initializeWorkflow(grievanceId: string, grievanceData: any): Promise<GrievanceState> {
    try {
      // Apply initial workflow rules
      const applicableRules = await this.getApplicableRules(grievanceData);
      const initialActions = await this.processRules(applicableRules, grievanceData);
      
      // Calculate SLA deadline
      const slaHours = await this.getSLAHours(grievanceData.category, grievanceData.grievance_type);
      const slaDeadline = new Date(Date.now() + slaHours * 60 * 60 * 1000).toISOString();
      
      // Calculate escalation deadline
      const escalationHours = await this.getEscalationHours(grievanceData.category, grievanceData.grievance_type);
      const escalationDeadline = new Date(Date.now() + escalationHours * 60 * 60 * 1000).toISOString();
      
      // Create workflow state
      const workflowState: GrievanceState = {
        id: crypto.randomUUID(),
        grievanceId,
        currentStatus: 'open',
        workflowStage: WORKFLOW_STAGES.SUBMITTED,
        slaDeadline,
        escalationDeadline,
        metadata: {
          initialRules: applicableRules.map(r => r.id),
          appliedActions: initialActions,
          autoAssigned: initialActions.autoAssign || false
        },
        lastTransitionAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      // Save workflow state
      await this.saveWorkflowState(workflowState);
      
      // Apply initial actions
      await this.applyWorkflowActions(grievanceId, initialActions, grievanceData);
      
      return workflowState;
      
    } catch (error) {
      console.error('Error initializing workflow:', error);
      throw error;
    }
  }
  
  /**
   * Process status transition
   */
  static async processStatusTransition(
    grievanceId: string,
    fromStatus: string,
    toStatus: string,
    userId: string,
    userRole: string,
    reason?: string
  ): Promise<boolean> {
    try {
      // Find applicable transition
      const transitionKey = `${fromStatus}_to_${toStatus}`;
      let transition = STATUS_TRANSITIONS[transitionKey];
      
      // Check for wildcard transitions
      if (!transition) {
        const wildcardKey = `any_to_${toStatus}`;
        transition = STATUS_TRANSITIONS[wildcardKey];
      }
      
      if (!transition) {
        throw new Error(`Invalid status transition: ${fromStatus} -> ${toStatus}`);
      }
      
      // Validate transition conditions
      const isValid = await this.validateTransition(transition, userId, userRole, grievanceId);
      if (!isValid) {
        throw new Error('Transition validation failed');
      }
      
      // Get current workflow state
      const workflowState = await this.getWorkflowState(grievanceId);
      if (!workflowState) {
        throw new Error('Workflow state not found');
      }
      
      // Update grievance status
      await supabase
        .from('grievances')
        .update({
          status: toStatus,
          updated_at: new Date().toISOString(),
          ...(transition.actions?.updateFields || {})
        })
        .eq('id', grievanceId);
      
      // Update workflow state
      workflowState.previousStatus = workflowState.currentStatus;
      workflowState.currentStatus = toStatus;
      workflowState.lastTransitionAt = new Date().toISOString();
      workflowState.updatedAt = new Date().toISOString();
      
      if (transition.actions?.updateFields?.workflow_stage) {
        workflowState.workflowStage = transition.actions.updateFields.workflow_stage;
      }
      
      workflowState.metadata = {
        ...workflowState.metadata,
        lastTransition: {
          from: fromStatus,
          to: toStatus,
          reason,
          userId,
          timestamp: new Date().toISOString()
        }
      };
      
      await this.saveWorkflowState(workflowState);
      
      // Execute transition actions
      if (transition.actions) {
        await this.executeTransitionActions(grievanceId, transition.actions, {
          fromStatus,
          toStatus,
          userId,
          userRole,
          reason
        });
      }
      
      // Log workflow transition
      await this.logWorkflowTransition(grievanceId, fromStatus, toStatus, userId, reason);
      
      return true;
      
    } catch (error) {
      console.error('Error processing status transition:', error);
      return false;
    }
  }
  
  /**
   * Check and process automated rules
   */
  static async processAutomatedRules(grievanceId: string): Promise<void> {
    try {
      // Get grievance data
      const { data: grievance, error } = await supabase
        .from('grievances')
        .select(`
          *,
          students (student_name, email, roll_number),
          routes (route_name, route_number)
        `)
        .eq('id', grievanceId)
        .single();
      
      if (error || !grievance) {
        throw new Error('Grievance not found');
      }
      
      // Get applicable rules for current state
      const rules = await this.getApplicableRules(grievance);
      const timeBasedRules = rules.filter(rule => rule.conditions.timeOpen);
      
      // Process time-based rules
      const createdAt = new Date(grievance.created_at);
      const hoursOpen = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
      
      for (const rule of timeBasedRules) {
        if (rule.conditions.timeOpen && hoursOpen >= rule.conditions.timeOpen) {
          await this.applyWorkflowActions(grievanceId, rule.actions, grievance);
          
          // Mark rule as applied
          await this.markRuleAsApplied(grievanceId, rule.id);
        }
      }
      
    } catch (error) {
      console.error('Error processing automated rules:', error);
    }
  }
  
  /**
   * Get applicable workflow rules for grievance
   */
  private static async getApplicableRules(grievanceData: any): Promise<WorkflowRule[]> {
    try {
      const { data: rules, error } = await supabase
        .from('grievance_workflow_rules')
        .select('*')
        .eq('is_active', true)
        .order('order');
      
      if (error) {
        console.error('Error fetching workflow rules:', error);
        return [];
      }
      
      const applicableRules: WorkflowRule[] = [];
      
      for (const rule of rules || []) {
        if (await this.evaluateRuleConditions(rule, grievanceData)) {
          applicableRules.push(rule);
        }
      }
      
      return applicableRules;
      
    } catch (error) {
      console.error('Error getting applicable rules:', error);
      return [];
    }
  }
  
  /**
   * Evaluate if rule conditions match grievance data
   */
  private static async evaluateRuleConditions(rule: any, grievanceData: any): Promise<boolean> {
    const conditions = rule.conditions || {};
    
    // Check category
    if (conditions.category && !conditions.category.includes(grievanceData.category)) {
      return false;
    }
    
    // Check grievance type
    if (conditions.grievance_type && !conditions.grievance_type.includes(grievanceData.grievance_type)) {
      return false;
    }
    
    // Check priority
    if (conditions.priority && !conditions.priority.includes(grievanceData.priority)) {
      return false;
    }
    
    // Check urgency
    if (conditions.urgency && !conditions.urgency.includes(grievanceData.urgency)) {
      return false;
    }
    
    // Check keywords in subject/description
    if (conditions.keywords && conditions.keywords.length > 0) {
      const text = `${grievanceData.subject} ${grievanceData.description}`.toLowerCase();
      const hasKeyword = conditions.keywords.some((keyword: string) => 
        text.includes(keyword.toLowerCase())
      );
      if (!hasKeyword) {
        return false;
      }
    }
    
    // Check time open (for time-based rules, this is handled separately)
    if (conditions.timeOpen) {
      const createdAt = new Date(grievanceData.created_at || Date.now());
      const hoursOpen = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
      if (hoursOpen < conditions.timeOpen) {
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Process workflow rules and return actions to apply
   */
  private static async processRules(rules: WorkflowRule[], grievanceData: any): Promise<any> {
    const actions: any = {};
    
    for (const rule of rules) {
      // Auto-assignment
      if (rule.actions.autoAssign) {
        actions.autoAssign = rule.actions.autoAssign;
      }
      
      // Priority/urgency updates
      if (rule.actions.setPriority) {
        actions.setPriority = rule.actions.setPriority;
      }
      
      if (rule.actions.setUrgency) {
        actions.setUrgency = rule.actions.setUrgency;
      }
      
      // Tags
      if (rule.actions.addTags) {
        actions.addTags = [...(actions.addTags || []), ...rule.actions.addTags];
      }
      
      // Notifications
      if (rule.actions.sendNotification) {
        actions.sendNotification = rule.actions.sendNotification;
      }
      
      // Escalation
      if (rule.actions.escalate) {
        actions.escalate = true;
        actions.escalateTo = rule.actions.escalateTo;
      }
    }
    
    return actions;
  }
  
  /**
   * Apply workflow actions to grievance
   */
  private static async applyWorkflowActions(
    grievanceId: string, 
    actions: any, 
    grievanceData: any
  ): Promise<void> {
    try {
      const updates: any = {};
      
      // Auto-assignment
      if (actions.autoAssign) {
        updates.assigned_to = actions.autoAssign;
        updates.status = 'in_progress';
      }
      
      // Priority/urgency updates
      if (actions.setPriority) {
        updates.priority = actions.setPriority;
      }
      
      if (actions.setUrgency) {
        updates.urgency = actions.setUrgency;
      }
      
      // Tags
      if (actions.addTags) {
        const currentTags = grievanceData.tags || [];
        updates.tags = [...new Set([...currentTags, ...actions.addTags])];
      }
      
      // Update grievance if there are changes
      if (Object.keys(updates).length > 0) {
        await supabase
          .from('grievances')
          .update(updates)
          .eq('id', grievanceId);
      }
      
      // Handle escalation
      if (actions.escalate && actions.escalateTo) {
        await supabase
          .from('grievances')
          .update({
            escalated_to: actions.escalateTo[0], // Escalate to first admin in list
            escalation_reason: 'Automated escalation based on workflow rules',
            escalated_at: new Date().toISOString()
          })
          .eq('id', grievanceId);
      }
      
      // Send notifications
      if (actions.sendNotification) {
        await this.sendWorkflowNotifications(grievanceId, actions.sendNotification, grievanceData);
      }
      
    } catch (error) {
      console.error('Error applying workflow actions:', error);
    }
  }
  
  /**
   * Validate transition conditions
   */
  private static async validateTransition(
    transition: WorkflowTransition,
    userId: string,
    userRole: string,
    grievanceId: string
  ): Promise<boolean> {
    // Check role requirements
    if (transition.conditions?.role && !transition.conditions.role.includes(userRole)) {
      return false;
    }
    
    // Check if approval is required
    if (transition.conditions?.approval) {
      // Implement approval logic here
      // This could check for pending approvals, supervisor confirmation, etc.
    }
    
    // Custom validation
    if (transition.conditions?.customValidation) {
      // Implement custom validation logic
    }
    
    return true;
  }
  
  /**
   * Execute transition actions
   */
  private static async executeTransitionActions(
    grievanceId: string,
    actions: any,
    context: any
  ): Promise<void> {
    try {
      // Send notifications
      if (actions.notification) {
        await this.sendTransitionNotifications(grievanceId, actions.notification, context);
      }
      
      // Run custom scripts
      if (actions.runScript) {
        await this.executeCustomScript(grievanceId, actions.runScript, context);
      }
      
    } catch (error) {
      console.error('Error executing transition actions:', error);
    }
  }
  
  /**
   * Send workflow notifications
   */
  private static async sendWorkflowNotifications(
    grievanceId: string,
    notificationType: string,
    grievanceData: any
  ): Promise<void> {
    try {
      // Implement notification sending based on type
      // This would integrate with the GrievanceNotificationService
      
    } catch (error) {
      console.error('Error sending workflow notifications:', error);
    }
  }
  
  /**
   * Send transition notifications
   */
  private static async sendTransitionNotifications(
    grievanceId: string,
    recipients: string[],
    context: any
  ): Promise<void> {
    try {
      // Implement transition notification logic
      
    } catch (error) {
      console.error('Error sending transition notifications:', error);
    }
  }
  
  /**
   * Execute custom script
   */
  private static async executeCustomScript(
    grievanceId: string,
    script: string,
    context: any
  ): Promise<void> {
    try {
      // Implement custom script execution
      // This could be used for complex business logic
      console.log('Custom script execution:', { grievanceId, script, context });
      
    } catch (error) {
      console.error('Error executing custom script:', error);
    }
  }
  
  /**
   * Get SLA hours for category/type
   */
  private static async getSLAHours(category: string, grievanceType: string): Promise<number> {
    try {
      const { data: config } = await supabase
        .from('grievance_categories_config')
        .select('sla_hours')
        .eq('category', category)
        .eq('grievance_type', grievanceType)
        .single();
      
      return config?.sla_hours || 72; // Default 72 hours
      
    } catch (error) {
      return 72;
    }
  }
  
  /**
   * Get escalation hours for category/type
   */
  private static async getEscalationHours(category: string, grievanceType: string): Promise<number> {
    try {
      const { data: config } = await supabase
        .from('grievance_categories_config')
        .select('escalation_hours')
        .eq('category', category)
        .eq('grievance_type', grievanceType)
        .single();
      
      return config?.escalation_hours || 48; // Default 48 hours
      
    } catch (error) {
      return 48;
    }
  }
  
  /**
   * Save workflow state
   */
  private static async saveWorkflowState(state: GrievanceState): Promise<void> {
    // This would save to a workflow_states table
    // For now, we'll store in grievance metadata
    await supabase
      .from('grievances')
      .update({
        internal_notes: JSON.stringify(state)
      })
      .eq('id', state.grievanceId);
  }
  
  /**
   * Get workflow state
   */
  private static async getWorkflowState(grievanceId: string): Promise<GrievanceState | null> {
    try {
      const { data: grievance } = await supabase
        .from('grievances')
        .select('internal_notes')
        .eq('id', grievanceId)
        .single();
      
      if (grievance?.internal_notes) {
        return JSON.parse(grievance.internal_notes);
      }
      
      return null;
      
    } catch (error) {
      return null;
    }
  }
  
  /**
   * Mark rule as applied
   */
  private static async markRuleAsApplied(grievanceId: string, ruleId: string): Promise<void> {
    // This would typically be stored in a separate applied_rules table
    // For now, we'll update the workflow state metadata
    const state = await this.getWorkflowState(grievanceId);
    if (state) {
      state.metadata.appliedRules = [...(state.metadata.appliedRules || []), ruleId];
      await this.saveWorkflowState(state);
    }
  }
  
  /**
   * Log workflow transition
   */
  private static async logWorkflowTransition(
    grievanceId: string,
    fromStatus: string,
    toStatus: string,
    userId: string,
    reason?: string
  ): Promise<void> {
    try {
      // This would log to a workflow_transitions table
      console.log('Workflow transition logged:', {
        grievanceId,
        fromStatus,
        toStatus,
        userId,
        reason,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Error logging workflow transition:', error);
    }
  }
  
  /**
   * Get workflow metrics
   */
  static async getWorkflowMetrics(dateRange?: { from: string; to: string }): Promise<any> {
    try {
      // This would provide metrics about workflow performance
      // Average time in each stage, bottlenecks, etc.
      
      return {
        averageTimeToAssignment: 0,
        averageTimeToResolution: 0,
        bottlenecks: [],
        automationEfficiency: 0,
        rulePerformance: []
      };
      
    } catch (error) {
      console.error('Error getting workflow metrics:', error);
      return null;
    }
  }
} 